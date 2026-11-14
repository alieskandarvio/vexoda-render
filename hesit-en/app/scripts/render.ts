#!/usr/bin/env bun
// Offline renderer. Drives the app in headless Chrome (?export=1) and either
//   stills:  bun scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//   plates:  bun scripts/render.ts plates   (renders one representative JPEG per plate into public/plates/ (used by the outro's rewind), times from plates.json or entry midpoints)
//   perf:    bun scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1] [--shutter 0.5]   (avg ms per frame incl. GPU sync and the export's pixel readback)
//   video:   bun scripts/render.ts video [--from 0] [--to 156.65] [--fps 60] [--crf 16] [--x264 aq-mode=3] [--samples 1] [--shutter 0.5] [--out ../out/pdoom.mp4] [--noaudio]
//            --out dir/name_%04d.jpg (or .png) writes numbered frames instead of an MP4 (no sound)
//            --samples N averages N sub-frames per frame over shutter×(1/fps): motion blur + temporal AA;
//            --samples auto picks the count per frame (4, 12, 36, 108 or 324, see Engine.render)
//   --scale N (all modes): render at N× the layout (--scale 2 = 3840x2160 for 16:9); stills are then saved
//            full-res from the pixel buffer, videos are encoded at the physical size.
//   --format WxH (all modes): the frame to lay out in (default: src/format.ts, 1920x1080); also reel (1080x1920),
//            card (820x1000), wide. Plates are written for one format: render each with its own (--only id --format …).
// Uses the Vite dev server at --url (default http://localhost:5173); starts a private one if unreachable.
//   gpu:     bun scripts/render.ts gpu   (prints the WebGL renderer in use: SwiftShader = software, slow but identical output)
// Browser: --chrome <path> / CHROME_PATH, else installed Google Chrome, else Playwright's Chromium, else common paths.
// ffmpeg:  $FFMPEG, else ~/.cache/motion-as-code/bin/ffmpeg (installed by the skill's setup.sh), else ffmpeg on PATH.
import { chromium, type Browser, type Page } from 'playwright-core';
import { DEFAULT_FORMAT, parseFormat } from '../src/format';
import { mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** mkdir -p that tolerates an existing directory (Bun on Windows throws EEXIST for relative paths). */
const ensureDir = (d: string) => { const a = path.resolve(d); if (!existsSync(a)) mkdirSync(a, { recursive: true }); };

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
const FMT = parseFormat(opt('format')) ?? DEFAULT_FORMAT;
if (opt('format') && !parseFormat(opt('format'))) throw new Error(`--format ${opt('format')}: use WxH (e.g. 1080x1920), reel, card or wide`);
const LW = FMT.w, LH = FMT.h; // logical layout size
const OW = LW * SCALE, OH = LH * SCALE; // output size
// --samples N (fixed) or --samples auto [--min-samples 4] [--max-samples 324] [--tol 3] (adaptive, see Engine.render)
const SAMPLES = opt('samples', '1') === 'auto'
  ? { min: +opt('min-samples', '4')!, max: +opt('max-samples', '324')!, tol: +opt('tol', '3')! }
  : +opt('samples', '1')!;
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
const ROOT = path.resolve(APP, '..');

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const url = opt('url', 'http://localhost:5173')!;
  if (await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  // no live reload: a file saved mid-render must not reload the page
  // (process.execPath = the bun running this script: works when bun/bunx are not on PATH)
  const proc = Bun.spawn([process.execPath, 'x', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, PDOOM_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 300 && !(await reachable(u)); i++) await Bun.sleep(100);
  if (!(await reachable(u))) { proc.kill(); throw new Error(`the Vite dev server did not start on ${u} (try: cd app && bun x vite)`); }
  return { url: u, stop: () => proc.kill() };
}

/** Browsers to try, in order (the first that launches wins). */
function browserCandidates(): Record<string, string>[] {
  const exe = opt('chrome') ?? process.env.CHROME_PATH;
  if (exe) return [{ executablePath: exe }];
  const out: Record<string, string>[] = [{ channel: process.env.BROWSER_CHANNEL ?? 'chrome' }, {}]; // installed Chrome, then Playwright's Chromium
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'])
    if (existsSync(p)) out.push({ executablePath: p });
  return out;
}

/**
 * GPU backend: d3d11 on Windows, metal on macOS; on Linux Chrome's default unless PDOOM_ANGLE=vulkan|gl|swiftshader.
 * Without a usable GPU Chrome falls back to SwiftShader (software WebGL): same pixels, several times slower.
 */
async function launchBrowser(): Promise<Browser> {
  const angle = process.env.PDOOM_ANGLE ?? (process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : '');
  const args = [
    ...(angle ? [`--use-angle=${angle}`] : []),
    '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(' ') : []),
  ].filter((a) => !(process.env.NO_GPU_RASTER && a === '--enable-gpu-rasterization'));
  let last: unknown = null;
  for (const b of browserCandidates()) {
    try { return await chromium.launch({ ...b, headless: !flag('headed'), args }); } catch (e) { last = e; }
  }
  throw new Error(`no usable Chrome/Chromium: install Google Chrome, or run \`bun x playwright-core install chromium\`, or set CHROME_PATH\n${String((last as Error)?.message ?? last).split('\n')[0]}`);
}

/** ffmpeg with libx264 (see the header). */
function ffmpegBin() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const cached = path.join(os.homedir(), '.cache', 'motion-as-code', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return existsSync(cached) ? cached : 'ffmpeg';
}

async function openPage(url: string) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: LW, height: LH }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1&format=${LW}x${LH}&lang=${opt('lang', 'en')}${process.env.RTF || existsSync(path.join(ROOT, 'out/RTF')) ? '&rtf=1' : ''}${only ? `&only=${only}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  await page.waitForFunction(() => (window as any).__pdoom?.ready || (window as any).__pdoom?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__pdoom.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const size: [number, number] = await page.evaluate(() => [(window as any).__pdoom.width, (window as any).__pdoom.height]);
  if (size[0] !== OW || size[1] !== OH) throw new Error(`app renders ${size[0]}x${size[1]}, expected ${OW}x${OH} (--scale ${SCALE})`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__pdoom.errors);
  if (sceneErrors.length) { console.error('SCENE ERRORS:\n' + sceneErrors.join('\n')); process.exitCode = 1; }
  return { browser, page, logs, bootErrors: sceneErrors.length };
}

async function stills(page: Page, times: number[], outDir: string) {
  ensureDir(outDir);
  const files: string[] = [];
  for (const t of times) {
    const k: number = await page.evaluate(([t, s, sh]) => (window as any).__pdoom.still(t, s, sh), [t, SAMPLES, +opt('shutter', '0.5')!] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    if (typeof SAMPLES !== 'number') console.log(`t=${t}: ${k} sub-frames`);
    // at scale > 1 the canvas is shown downscaled on the page: save the full-res pixel buffer instead
    if (SCALE !== 1) await Bun.write(f, Buffer.from(await page.evaluate(() => (window as any).__pdoom.png()), 'base64'));
    else await page.screenshot({ path: f, clip: { x: 0, y: 0, width: LW, height: LH } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, cw, ch }) => {
    const P = (window as any).__pdoom;
    const pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    for (const [i, t] of (times as number[]).entries()) {
      await P.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    }
    return cv.toDataURL('image/png');
  }, { times, cols, cw: LW >= LH ? 480 : Math.round((480 * LW) / LH), ch: LW >= LH ? Math.round((480 * LH) / LW) : 480 });
  ensureDir(path.dirname(out));
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  ensureDir(path.dirname(out));
  const crf = opt('crf', '16')!;
  // an image-sequence pattern (…/name_%04d.jpg or .png): numbered frames from 0001, no sound — e.g. the frames
  // video-ad-editor-masri takes as a generated scene (<work>/gen/<name>_%04d.jpg at 30 fps)
  const seq = /%0\d+d/.test(out);
  const audio = path.join(ROOT, 'audio/voiceover.mp3');
  const withAudio = !seq && !flag('noaudio') && existsSync(audio);
  if (!seq && !flag('noaudio') && !withAudio) console.error('no audio/voiceover.mp3: rendering without sound');
  const args = [ffmpegBin(), '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0'];
  if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  if (seq) {
    // frames are sRGB already: just flip (bottom-up) and write full-range images
    args.push('-vf', 'vflip', '-start_number', '1');
    if (/\.jpe?g$/i.test(out)) args.push('-q:v', opt('jpeg-q', '2')!, '-pix_fmt', 'yuvj444p');
    args.push(out);
  } else {
    // Frames are sRGB (toSRGB in the final pass): convert with the BT.709 matrix and tag the stream,
    // otherwise ffmpeg converts with BT.601 while players and YouTube decode untagged HD as BT.709.
    // scale tags the matrix and range; primaries and transfer need setparams (the -color_* output flags don't reach the stream).
    if (flag('inter')) // a near-lossless 4:4:4 intermediate (the deliverables are encoded from it afterwards)
      args.push('-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-preset', 'faster', '-crf', opt('crf', '6')!, '-pix_fmt', 'yuv444p', '-threads', '6');
    else args.push('-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', opt('x264', 'aq-mode=3')!);
    if (withAudio) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
    args.push('-movflags', '+faststart', out);
  }
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: Math.max(64 * 1024 * 1024, OW * OH * 4 + 1024),
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames)); // ack: the page keeps at most a few frames ahead of ffmpeg (bounded memory at 4K)
        if (frames % 30 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          const line = `${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s`;
          process.stdout.write(process.stdout.isTTY ? `\r${line}   ` : `${line}\n`); // newline per update in a log file
        }
      },
    },
  });
  const used: Record<string, number> = await page.evaluate((o) => (window as any).__pdoom.stream(o), { from, to, fps, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: +opt('shutter', '0.5')!, inflight: 4 });
  // wait for all frames to arrive
  while (frames < total) await Bun.sleep(20);
  ff.stdin.end();
  await ff.exited;
  server.stop();
  console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs, bootErrors } = await openPage(url);
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const files = await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!);
    console.log(files.join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      // 4 frames around every timeline boundary: 2 frames before, 2 after
      const tl: { id: string; start: number }[] = await page.evaluate(() => (window as any).__pdoom.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'plates') {
    const tl: { id: string; start: number; end: number }[] = await page.evaluate(() => (window as any).__pdoom.timeline);
    const figs = ['open', 'loss', 'room', 'shoggoth', 'spacetime', 'ascent', 'bureau', 'leftturn', 'paperclips', 'fuse', 'stack', 'dense', 'loom', 'ilya'];
    const overrides: Record<string, number> = existsSync(path.join(APP, 'plates.json')) ? await Bun.file(path.join(APP, 'plates.json')).json() : {};
    const dir = path.join(APP, 'public/plates');
    ensureDir(dir);
    await page.evaluate(() => { (window as any).__pdoom.engine.hudOff = true; });
    for (let i = 0; i < figs.length; i++) {
      const e = tl.find((x) => x.id === figs[i]);
      if (!e) continue;
      const t = overrides[figs[i]!] ?? (e.start + e.end) / 2;
      await page.evaluate((t) => (window as any).__pdoom.still(t, 4, 0.2), t);
      const f = path.join(dir, `fig${String(i + 1).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: LW, height: LH } });
      console.log(f, t.toFixed(2));
    }
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples, shutter }) => {
      const P = (window as any).__pdoom;
      const ms: number[] = [];
      const buf = new Uint8Array(P.width * P.height * 4);
      await P.still(from);
      const used: Record<number, number> = {};
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        const k = P.engine.render(t, 1 / 60, false, samples, shutter);
        used[k] = (used[k] ?? 0) + 1;
        await P.engine.readPixelsAsync(buf);
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], used };
    }, { from, to, samples: SAMPLES, shutter: +opt('shutter', '0.5')! });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  sub-frames ${hist(r.used)}`);
  } else if (mode === 'prof') {
    const from = +opt('from', '0')!, n = +opt('n', '6')!;
    if (process.env.ANISO1) await page.evaluate(() => { (window as any).__ANISO1 = 1; });
    const r = await page.evaluate(async ({ from, n }) => {
      const P = (window as any).__pdoom, E = P.engine;
      const gl = E.renderer.getContext();
      const px = new Uint8Array(4);
      const sync = () => gl.finish();
      P.still(from); sync();
      // attribute time: wrap the active scene's helpers and the engine's post (each followed by a GL sync)
      const acc: Record<string, number> = {};
      const wrap = (obj: any, key: string, label: string) => {
        if (!obj || typeof obj[key] !== 'function') return;
        const f = obj[key].bind(obj);
        obj[key] = (...a: any[]) => { const t0 = performance.now(); const r = f(...a); sync(); acc[label] = (acc[label] ?? 0) + performance.now() - t0; return r; };
      };
      for (const [id, rec] of E.loaded) {
        const sc = rec.scene; if (!sc) continue;
        wrap(sc.bg, 'render', id + '.bg'); wrap(sc.stage, 'render', id + '.stage3d'); wrap(sc.talk, 'draw', id + '.talk'); wrap(sc.lines, 'render', id + '.lines2');
        for (const k of ['drawDynamic', 'drawCard', 'drawStatic']) wrap(sc, k, id + '.' + k);
        if (sc.phone) wrap(sc.phone, 'draw', id + '.phone2d');
        if (sc.fx) wrap(sc.fx, 'render', id + '.lines');
        if (sc.ui) wrap(sc.ui, 'upload', id + '.ui.upload');
      }
      wrap(E.comp, 'draw', 'comp.draw');
      wrap(E.post, 'render', 'post');
      wrap(E.hud, 'draw', 'hud');
      (window as any).__acc = acc;
      if ((window as any).__ANISO1) for (const [, rec] of E.loaded) { const sc = rec.scene; if (!sc) continue;
        for (const k of Object.keys(sc)) { const m = sc[k]?.mat?.uniforms?.map?.value; if (m && m.anisotropy > 1) { m.anisotropy = 1; m.needsUpdate = true; } } }
      const rows: number[][] = [];
      for (let i = 1; i <= n; i++) {
        const t = from + i / 240;
        const a = performance.now();
        E.render(t, 1 / 240, false, 1, 0.5); sync();
        const b = performance.now();
        await E.readPixelsAsync();
        const c = performance.now();
        rows.push([b - a, c - b]);
      }
      return { rows, acc };
    }, { from, n });
    for (const [a, b] of r.rows) console.log(`render ${a.toFixed(0)} ms   readback ${b.toFixed(0)} ms`);
    console.log(Object.entries(r.acc).sort((x: any, y: any) => y[1] - x[1]).map(([k, v]: any) => `${k} ${(v / n).toFixed(0)}ms`).join('\n'));
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__pdoom.duration);
    await video(page, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, 'out/motion-as-code.mp4'))!));
  }
  // plates that threw while rendering (their frames came out dark red)
  const errs: string[] = await page.evaluate(() => (window as any).__pdoom.errors ?? []);
  if (errs.length > bootErrors) { console.error('SCENE ERRORS (while rendering):\n' + errs.slice(bootErrors).join('\n')); process.exitCode = 1; }
  // (SwiftShader's "GPU stall due to ReadPixels" warning is expected and harmless)
  const shown = logs.filter((l) => !l.includes('GPU stall due to ReadPixels'));
  if (shown.length) console.error('BROWSER LOG:\n' + shown.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
