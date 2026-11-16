// VEXODA additions to the Motion as Code toolkit (the anthem reel, v2): the real logo (lockup SVG) drawn by the
// spark, the full-bleed lime FIELD the chorus slams land on, rubber stamps, centred stroke writing, odometer digits.
// Visual language = the kit's (ink, bone, ONE accent — here the brand lime; construction drawings; the spark).
import { FSPass, W, H } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { strokeText, type StrokeFontName } from '../engine/stroke';
import type { Word } from '../engine/lyrics';
import { clamp, ease, lerp, mulberry32 } from '../engine/util';
import { rgba } from '../engine/palette';
import { Plot, setWorld, type Cam } from './_vo';

// ------------------------------------------------------------------ the logo
export interface Logo { v: Path2D; vStrokes: { x: number; y: number }[][]; letters: Path2D[]; letterX: [number, number][]; W: number; H: number }
let LOGO: Logo | null = null;
export async function loadLogo(): Promise<Logo> {
  if (LOGO) return LOGO;
  const svg = await (await fetch('brand/vexoda-lockup.svg')).text();
  const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!.replace(/\s+/g, ' '));
  const vD = ds[0]!, wD = ds[1]!;
  const tf = new DOMMatrix([0.1, 0, 0, -0.1, 0, 1006]);
  const mk = (d: string, dx = 0) => { const p = new Path2D(); p.addPath(new Path2D(d), new DOMMatrix([0.1, 0, 0, -0.1, dx, 1006])); return p; };
  const ns = 'http://www.w3.org/2000/svg';
  const vStrokes = vD.split(/(?=M)/).filter((s) => s.trim()).map((d) => {
    const el = document.createElementNS(ns, 'path'); el.setAttribute('d', d);
    const L = el.getTotalLength(), n = 260, pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) { const q = el.getPointAtLength((L * i) / n); const r = tf.transformPoint(new DOMPoint(q.x, q.y)); pts.push({ x: r.x, y: r.y }); }
    return pts;
  }).sort((a, b) => a.reduce((s, q) => s + q.x, 0) / a.length - b.reduce((s, q) => s + q.x, 0) / b.length);
  const subW = wD.split(/(?=M)/).filter((s) => s.trim());
  const letters = subW.map((d) => mk(d, 1214));
  const letterX: [number, number][] = subW.map((d) => {
    const el = document.createElementNS(ns, 'path'); el.setAttribute('d', d);
    const s = document.createElementNS(ns, 'svg'); s.style.position = 'absolute'; s.style.left = '-99999px';
    s.appendChild(el); document.body.appendChild(s);
    const bb = el.getBBox(); s.remove();
    return [1214 + bb.x * 0.1, 1214 + (bb.x + bb.width) * 0.1];
  });
  LOGO = { v: mk(vD), vStrokes, letters, letterX, W: 5125, H: 1006 };
  return LOGO;
}
/** Centre line of each V stroke (lockup units), top → bottom; the spark follows it. */
export function vCentre(L: Logo): [number, number][][] {
  return L.vStrokes.map((pts) => {
    const ys = pts.map((p) => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const out: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const yy = lerp(y0 + 6, y1 - 6, i / 30);
      let lo = 1e9, hi = -1e9;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j]!, b = pts[(j + 1) % pts.length]!;
        if ((a.y - yy) * (b.y - yy) <= 0 && a.y !== b.y) { const x = a.x + ((yy - a.y) / (b.y - a.y)) * (b.x - a.x); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
      if (lo < 1e8) out.push([(lo + hi) / 2, yy]);
    }
    return out;
  });
}
/**
 * The lockup with its top-left at the current transform's origin, width w. vk: per V stroke 0..1 (left: top→bottom,
 * right: bottom→top); lk: per letter E X O D A 0..1 (rises out of a mask).
 */
export function drawLockup(c: CanvasRenderingContext2D, L: Logo, w: number, o: { vk?: [number, number]; lk?: number[]; vCol?: string; lCol?: string; vOnly?: boolean; alpha?: number } = {}) {
  const s = w / L.W, vk = o.vk ?? [1, 1];
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.scale(s, s);
  c.fillStyle = o.vCol ?? rgba('signal');
  for (let i = 0; i < 2; i++) {
    const k = clamp(vk[i]!), pts = L.vStrokes[i];
    if (k <= 0 || !pts) continue;
    const ys = pts.map((p) => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys), hh = y1 - y0 + 20;
    c.save(); c.beginPath();
    if (i === 0) c.rect(-200, y0 - 10, 2400, hh * k); else c.rect(-200, y1 + 10 - hh * k, 2400, hh * k);
    c.clip(); c.beginPath(); pts.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); c.restore();
  }
  if (!o.vOnly) {
    const lk = o.lk ?? [1, 1, 1, 1, 1];
    c.fillStyle = o.lCol ?? rgba('bone');
    L.letters.forEach((p, i) => {
      const k = clamp(lk[i] ?? 1);
      if (k <= 0) return;
      const e = ease.outExpo(k);
      c.save();
      c.beginPath(); c.rect(L.letterX[i]![0] - 40, -40, L.letterX[i]![1] - L.letterX[i]![0] + 80, 1086); c.clip(); // a mask per letter
      c.translate(0, (1 - e) * 1006);
      c.fill(p);
      c.restore();
    });
  }
  c.restore();
}
/** The spark's position on the V while it draws stroke i at progress k (0..1), in lockup units. */
export function vHead(cl: [number, number][][], i: number, k: number): [number, number] | null {
  const pts = cl[i];
  if (!pts || k <= 0 || k >= 1) return null;
  const u = i === 0 ? k : 1 - k;
  const j = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1))), f = u * (pts.length - 1) - j;
  return [lerp(pts[j]![0], pts[j + 1]![0], f), lerp(pts[j]![1], pts[j + 1]![1], f)];
}

// ------------------------------------------------------------------ the lime field (the chorus slams land on it)
export const LIME_FIELD = /* glsl */ `
uniform float t, k, close, open;
uniform vec2 uC;          // the opening circle's centre (px, y down)
void main() {
  vec2 px = FRAG_PX;
  vec2 sp = vec2(px.x, ${H.toFixed(1)} - px.y);
  vec2 p = vUv - 0.5;
  vec3 col = C_SIGNAL * (1.0 + 0.1 * (0.5 - length(p * vec2(1.0, 1.4))));
  // engraved texture: fine diagonal hairlines in deep lime, very faint
  float h = hatch((px.x - px.y) / 9.0, 0.12 + 0.05 * snoise(px * 0.004 + t * 0.05));
  col = mix(col, C_BLOOD, 0.22 * h);
  col += C_EMBER * 0.2 * k * exp(-dot(p, p) * 6.0);
  // a shutter that closes to ink, and a circle that opens it from uC
  float s = step(abs(vUv.y - 0.5), 0.5 * (1.0 - close));
  float o = 1.0 - smoothstep(open - 1.5, open + 1.5, length(sp - uC));
  col = mix(C_INK, col, s * o);
  fragColor = vec4(col, 1.0);
}`;
export const limeField = () => new FSPass(LIME_FIELD, { t: { value: 0 }, k: { value: 0 }, close: { value: 0 }, open: { value: 1e5 }, uC: { value: [W / 2, H / 2] } });

// ------------------------------------------------------------------ stamps
export function makeStamp(big: string, top: string, bottom: string, colr: string, seed = 7) {
  const cv = document.createElement('canvas');
  const SW = 1100, SH = 330;
  cv.width = SW; cv.height = SH;
  const c = cv.getContext('2d')!;
  c.strokeStyle = colr; c.fillStyle = colr;
  c.lineWidth = 12; c.strokeRect(16, 16, SW - 32, SH - 32);
  c.lineWidth = 4; c.strokeRect(40, 40, SW - 80, SH - 80);
  const fam = F.archivo(100, 900);
  const fs = Math.min(170, (150 * (SW - 180)) / measure(big, fam, 150));
  c.font = font(fam, fs); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText(big, SW / 2, 228);
  c.font = font(F.mono(500), 26); (c as any).letterSpacing = '8px';
  c.fillText(top, SW / 2, 88); c.fillText(bottom, SW / 2, 284);
  c.globalCompositeOperation = 'destination-out';
  const r = mulberry32(seed);
  for (let i = 0; i < 2800; i++) { c.globalAlpha = 0.25 + 0.75 * r(); c.beginPath(); c.arc(r() * SW, r() * SH, 0.6 + r() * 2.4, 0, 6.3); c.fill(); }
  for (let i = 0; i < 30; i++) { c.globalAlpha = 0.18 * r(); c.fillRect(r() * SW, r() * SH, 60 + r() * 300, 2 + r() * 5); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return cv;
}
/** Slam a stamp canvas at world (x, y) at t0 (scale from 1.6, a little rotation). */
export function drawStamp(ctx: CanvasRenderingContext2D, c: Cam, t: number, t0: number, cv: HTMLCanvasElement, x: number, y: number, scale: number, rot = -0.07, alpha = 0.92) {
  if (t < t0) return;
  const age = t - t0;
  const sc = 1 + 0.6 * (1 - ease.outExpo(clamp(age / 0.12)));
  setWorld(ctx, c, x, y, scale * sc, rot);
  ctx.globalAlpha = alpha * clamp(age / 0.05);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ------------------------------------------------------------------ writing
/** Write text with the pen centred on cx (stroke font), each token while its word is sung. Returns the stroke text. */
export function writeCentred(plot: Plot, text: string, words: Word[], fontName: StrokeFontName, size: number, cx: number, y: number, group: string, o: { width?: number; kind?: 'plot' | 'signal' | 'ink'; endEarly?: number; minDur?: number } = {}) {
  const st = strokeText(text, fontName, size);
  plot.writeWords(text, words, fontName, size, cx - st.width / 2, y, group, { width: o.width ?? 2.2, kind: o.kind, endEarly: o.endEarly, minDur: o.minDur });
  return st;
}
/** A fake Word (for strokes keyed to beats, not sung words). */
export const at = (start: number, end: number): Word => ({ w: '', start, end, line: 0, index: 0, gi: 0 });

// ------------------------------------------------------------------ odometer
/** Draw a number whose digits roll into place (each digit from 0 up to its value), in world space at (x, y) baseline. */
export function odometer(ctx: CanvasRenderingContext2D, c: Cam, s: string, x: number, y: number, size: number, fam: string, t: number, t0: number, o: { stagger?: number; dur?: number; col?: string; align?: 'left' | 'center' | 'right' } = {}) {
  const chars = Array.from(s);
  const ws = chars.map((ch) => measure(ch, fam, size));
  const tot = ws.reduce((a, b) => a + b, 0);
  let x0 = o.align === 'center' ? x - tot / 2 : o.align === 'right' ? x - tot : x;
  const st = o.stagger ?? 0.05, dur = o.dur ?? 0.5;
  setWorld(ctx, c, 0, 0);
  const [sx0] = [0];
  void sx0;
  chars.forEach((ch, i) => {
    const d = ch.charCodeAt(0) - 48;
    const k = ease.outExpo(clamp((t - t0 - (chars.length - 1 - i) * st) / dur));
    if (k <= 0) { x0 += ws[i]!; return; }
    setWorld(ctx, c, x0, y, size / 100);
    ctx.font = font(fam, 100);
    ctx.fillStyle = o.col ?? rgba('bone');
    ctx.textAlign = 'left';
    if (d >= 0 && d <= 9) {
      // a strip of digits 0..d rolling up; clip to one digit cell
      ctx.save();
      ctx.beginPath(); ctx.rect(-4, -96, (ws[i]! / size) * 100 + 8, 118); ctx.clip();
      const roll = d * k;
      for (let n = Math.max(0, Math.floor(roll) - 1); n <= Math.min(d, Math.ceil(roll) + 1); n++) ctx.fillText(String(n), 0, (n - roll) * 118);
      ctx.restore();
    } else { ctx.globalAlpha = clamp(k * 3); ctx.fillText(ch, 0, 0); ctx.globalAlpha = 1; }
    x0 += ws[i]!;
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
export { W, H };

// ------------------------------------------------------------------ a scanline raster (a capture printed line by line)
/**
 * Draw `img` into the world rect (x, y, w, h) revealed top → bottom up to k (0..1), with a lime scanline at the
 * front and the not-yet-settled band just above it slightly offset (a raster being written). r = corner radius.
 */
export function raster(ctx: CanvasRenderingContext2D, c: Cam, img: CanvasImageSource, x: number, y: number, w: number, h: number, k: number, o: { r?: number; alpha?: number; src?: [number, number, number, number] } = {}) {
  if (k <= 0) return;
  const kk = clamp(k), r = o.r ?? 0;
  setWorld(ctx, c, x, y);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.beginPath();
  if (r > 0) (ctx as any).roundRect(0, 0, w, h, r); else ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.beginPath(); ctx.rect(0, 0, w, h * kk); ctx.clip();
  const [sx, sy, sw, sh] = o.src ?? [0, 0, (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width, (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height];
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  // the fresh band: a few offset slices
  if (kk < 1) {
    const fy = h * kk;
    for (let i = 0; i < 6; i++) {
      const by = fy - (i + 1) * 9, off = (i % 2 ? 1 : -1) * (6 - i) * 2.2;
      if (by < 0) break;
      ctx.drawImage(img, sx, sy + (by / h) * sh, sw, (9 / h) * sh, off, by, w, 9);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba('signal', 0.95); ctx.fillRect(0, fy - 2, w, 3);
    ctx.fillStyle = rgba('ember', 0.25); ctx.fillRect(0, fy - 14, w, 12);
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
