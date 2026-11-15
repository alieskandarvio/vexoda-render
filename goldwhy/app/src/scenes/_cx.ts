// The «context» reel's own kit (ExecutionFX-style ad, Arabic, VEXODA): a deep night field behind everything, neon
// glass cards whose borders glow in HDR (drawn on a separate layer and added ×tint so the bloom catches them),
// candlestick charts that build themselves, and a sound-off subtitle row that lights word by word.
import { FSPass, W, H } from '../engine/gl';
import { font } from '../engine/type';
import type { Line, Lyrics } from '../engine/lyrics';
import { clamp, ease, lerp, mulberry32, noise1, prog } from '../engine/util';
import { hexToLinear } from '../engine/util';

export { W, H };

// ------------------------------------------------------------------ colour
export const NEON = {
  teal: '#2DE2D0',
  purple: '#A56BFF',
  lime: '#92C720',
  orange: '#FF9F2E',
  magenta: '#FF3D8B',
  blue: '#3D8BFF',
  red: '#FF3B3B',
  up: '#22D39A',
  down: '#FF4D5E',
} as const;
export const INK = '#07080B';
export const BONE = '#F2F2F2';
export function hexA(hex: string, a = 1) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export const lin = (hex: string): [number, number, number] => hexToLinear(hex);

// faces: the website's variable Cairo (200..1000) for Arabic, Artegra for the Latin brand name, Geist for figures
export const AR = (wt = 700) => `CairoV@${wt}`;
export const LAT = (wt = 600) => `Artegra-${wt}`;
export const NUM = (wt = 500) => `Geist-${wt}`;

// ------------------------------------------------------------------ the night field
const BG = /* glsl */ `
uniform float t; uniform vec3 tint; uniform vec3 tint2; uniform float glow; uniform vec2 gc; uniform float gr;
uniform float alert; uniform float paper; uniform float stars;
void main() {
  vec2 px = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  float d = length((px - gc) / vec2(gr, gr * 1.15));
  vec3 base = vec3(0.0035, 0.0045, 0.008);
  vec3 c = base + tint * glow * exp(-d * d * 1.6);
  // a second, wider wash so the frame is never flat black
  c += tint2 * 0.35 * glow * exp(-pow(length((px - vec2(${W / 2}.0, ${H}.0 * 1.05)) / ${H}.0), 2.0) * 3.0);
  // slow haze
  float n = fbm(vec3(px / 520.0, t * 0.05), 4);
  c *= 0.85 + 0.3 * n;
  // dust specks
  vec2 g = floor(px / 9.0);
  float h = hash12(g);
  float tw = 0.5 + 0.5 * sin(t * (1.0 + h * 3.0) + h * 40.0);
  c += vec3(0.6, 0.75, 1.0) * stars * step(0.9985, h) * tw * 0.25;
  // red alert: hot edges
  float e = length((vUv - 0.5) * vec2(1.0, 1.25)) * 1.55;
  c += vec3(1.2, 0.02, 0.015) * alert * smoothstep(0.7, 1.4, e) * (0.85 + 0.15 * sin(t * 6.0));
  c = mix(c, vec3(0.87, 0.87, 0.86), paper);
  fragColor = vec4(c, 1.0);
}`;
export const bgPass = () => new FSPass(BG, {
  t: { value: 0 }, tint: { value: lin(NEON.blue) }, tint2: { value: lin('#1b2a6b') }, glow: { value: 0.12 },
  gc: { value: [W / 2, H * 0.45] }, gr: { value: 900 }, alert: { value: 0 }, paper: { value: 0 }, stars: { value: 1 },
});
export function setBg(p: FSPass, t: number, o: { tint?: string; tint2?: string; glow?: number; gc?: [number, number]; gr?: number; alert?: number; paper?: number; stars?: number } = {}) {
  p.u.t!.value = t;
  p.u.tint!.value = lin(o.tint ?? NEON.blue);
  p.u.tint2!.value = lin(o.tint2 ?? '#1b2a6b');
  p.u.glow!.value = o.glow ?? 0.12;
  p.u.gc!.value = o.gc ?? [W / 2, H * 0.45];
  p.u.gr!.value = o.gr ?? 900;
  p.u.alert!.value = o.alert ?? 0;
  p.u.paper!.value = o.paper ?? 0;
  p.u.stars!.value = o.stars ?? 1;
}

// ------------------------------------------------------------------ shapes
export function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
/** Neon stroke: a soft wide halo + a crisp core. Draw on the glow layer (added in HDR) for the real bloom. */
export function neonStroke(c: CanvasRenderingContext2D, col: string, w: number, a = 1, blur = 18) {
  c.save();
  c.shadowColor = hexA(col, 0.9 * a);
  c.shadowBlur = blur;
  c.strokeStyle = hexA(col, 0.55 * a);
  c.lineWidth = w * 2.2;
  c.stroke();
  c.shadowBlur = 0;
  c.strokeStyle = hexA(col, a);
  c.lineWidth = w;
  c.stroke();
  c.restore();
}

/** Arabic (or any) text, shaped whole by the browser. align: 'right' | 'left' | 'center' in screen terms. */
export function say(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fam: string, col: string,
  o: { align?: CanvasTextAlign; a?: number; rtl?: boolean; base?: CanvasTextBaseline; spacing?: number } = {}) {
  c.save();
  c.font = font(fam, size);
  c.direction = o.rtl ?? /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr';
  c.textAlign = o.align ?? 'right';
  c.textBaseline = o.base ?? 'alphabetic';
  if (o.spacing) (c as any).letterSpacing = `${o.spacing}px`;
  c.globalAlpha *= o.a ?? 1;
  c.fillStyle = col;
  c.fillText(s, x, y);
  const w = c.measureText(s).width;
  c.restore();
  return w;
}
export function measureAr(c: CanvasRenderingContext2D, s: string, size: number, fam: string) {
  c.save(); c.font = font(fam, size); c.direction = 'rtl'; const w = c.measureText(s).width; c.restore(); return w;
}

// ------------------------------------------------------------------ candles
export interface Bar { o: number; h: number; l: number; c: number }
/** A deterministic OHLC series that passes through the given waypoints [barIndex, close]. */
export function series(seed: number, n: number, way: [number, number][], vol = 1) {
  const r = mulberry32(seed);
  const target = (i: number) => {
    for (let k = 1; k < way.length; k++) {
      const [i0, v0] = way[k - 1]!, [i1, v1] = way[k]!;
      if (i <= i1) return lerp(v0, v1, ease.inOutQuad(clamp((i - i0) / Math.max(1, i1 - i0))));
    }
    return way[way.length - 1]![1];
  };
  const out: Bar[] = [];
  let prev = target(0);
  for (let i = 0; i < n; i++) {
    const c = target(i) + (r() - 0.5) * vol * 1.6;
    const o = prev + (r() - 0.5) * vol * 0.5;
    const h = Math.max(o, c) + r() * vol * 1.1;
    const l = Math.min(o, c) - r() * vol * 1.1;
    out.push({ o, h, l, c });
    prev = c;
  }
  return out;
}
export function rangeOf(b: Bar[], pad = 0.08) {
  let lo = Infinity, hi = -Infinity;
  for (const x of b) { lo = Math.min(lo, x.l); hi = Math.max(hi, x.h); }
  const p = (hi - lo) * pad;
  return { lo: lo - p, hi: hi + p };
}
/**
 * Candles in a rect (time runs left → right even in Arabic, as on the platform), revealed up to k (0..1).
 * The bar being formed grows from its open. Returns the x,y of the last drawn close (for labels / glows).
 */
export function drawCandles(c: CanvasRenderingContext2D, bars: Bar[], x: number, y: number, w: number, h: number, k: number,
  o: { lo?: number; hi?: number; up?: string; down?: string; a?: number; bodyW?: number; glow?: number } = {}) {
  const r = rangeOf(bars);
  const lo = o.lo ?? r.lo, hi = o.hi ?? r.hi;
  const n = bars.length, step = w / n, bw = Math.max(2, step * (o.bodyW ?? 0.62));
  const Y = (v: number) => y + h - ((v - lo) / (hi - lo)) * h;
  const shown = k * n;
  let last: [number, number] = [x, Y(bars[0]!.o)];
  c.save();
  c.globalAlpha *= o.a ?? 1;
  for (let i = 0; i < n; i++) {
    const g = clamp(shown - i);
    if (g <= 0) break;
    const b = bars[i]!;
    const cl = lerp(b.o, b.c, ease.outCubic(g));
    const hiV = lerp(Math.max(b.o, cl), b.h, g), loV = lerp(Math.min(b.o, cl), b.l, g);
    const col = cl >= b.o ? (o.up ?? NEON.up) : (o.down ?? NEON.down);
    const cx = x + step * (i + 0.5);
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = Math.max(1, bw * 0.16);
    c.beginPath(); c.moveTo(cx, Y(hiV)); c.lineTo(cx, Y(loV)); c.stroke();
    const top = Y(Math.max(b.o, cl)), bot = Y(Math.min(b.o, cl));
    c.fillRect(cx - bw / 2, top, bw, Math.max(1.5, bot - top));
    last = [cx, Y(cl)];
  }
  c.restore();
  return { last, Y, X: (i: number) => x + step * (i + 0.5), lo, hi };
}

// ------------------------------------------------------------------ sound-off subtitles
/**
 * One subtitle row (wraps to two): the line being said, its words lighting as they are spoken (dim → lime → bone).
 * Fades in just before the line and out after it.
 */
export function subtitle(c: CanvasRenderingContext2D, L: Line, t: number, cy: number, o: { size?: number; maxW?: number; a?: number; hot?: string; done?: string; dim?: string } = {}) {
  const size = o.size ?? 50, maxW = o.maxW ?? 820, fam = AR(700);
  const a = (o.a ?? 1) * prog(t, L.start - 0.25, L.start + 0.05) * (1 - prog(t, L.end + 0.35, L.end + 0.6));
  if (a <= 0.001) return;
  c.save();
  c.font = font(fam, size);
  c.direction = 'rtl';
  const sp = c.measureText(' ').width;
  const ws = L.words.map((w) => ({ w, width: c.measureText(w.w).width }));
  // wrap
  const rows: (typeof ws)[] = [[]];
  let acc = 0;
  for (const x of ws) {
    if (acc + x.width > maxW && rows[rows.length - 1]!.length) { rows.push([]); acc = 0; }
    rows[rows.length - 1]!.push(x); acc += x.width + sp;
  }
  const lh = size * 1.45;
  const y0 = cy - ((rows.length - 1) * lh) / 2;
  rows.forEach((row, ri) => {
    const rw = row.reduce((s, x) => s + x.width, 0) + sp * (row.length - 1);
    let xr = W / 2 + rw / 2;
    for (const { w, width } of row) {
      const k = clamp((t - w.start) / Math.max(0.05, w.end - w.start));
      const done = t > w.end + 0.25;
      const col = t < w.start ? (o.dim ?? 'rgba(242,242,242,0.38)') : done ? (o.done ?? BONE) : (o.hot ?? NEON.lime);
      c.globalAlpha = a;
      c.fillStyle = col;
      c.textAlign = 'right';
      c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 14;
      const lift = t >= w.start && !done ? -3 * Math.sin(Math.PI * k) : 0;
      c.fillText(w.w, xr, y0 + ri * lh + lift);
      xr -= width + sp;
    }
  });
  c.restore();
}
export const lineAt = (ly: Lyrics, q: string, nth = 0) => ly.get(q, nth);

/** Gentle hand-held drift (px) for a layer. */
export const drift = (t: number, amp: number, seed = 1): [number, number] => [amp * noise1(t * 0.35, seed), amp * noise1(t * 0.31, seed + 7)];

/** A label on an opaque rounded chip, centred on (cx, cy): readable over candles and lines (draw it on the top layer). */
export function chip(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, fam: string, col: string,
  o: { bg?: string; border?: string; padX?: number; h?: number; rtl?: boolean } = {}) {
  c.save();
  c.font = font(fam, size);
  c.direction = o.rtl ?? /[؀-ۿ]/.test(text) ? 'rtl' : 'ltr';
  const w = c.measureText(text).width + 2 * (o.padX ?? 14), h = o.h ?? size + 18;
  rrect(c, cx - w / 2, cy - h / 2, w, h, Math.min(12, h / 2));
  c.fillStyle = o.bg ?? 'rgba(7,8,11,0.88)'; c.fill();
  if (o.border) { c.strokeStyle = o.border; c.lineWidth = 2; c.stroke(); }
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, cx, cy + size * 0.06);
  c.restore();
  return w;
}

/**
 * Subtitles for consecutive lines: only ONE line is ever on screen (the latest one that has begun), so two short
 * lines said back to back never overlap while one fades out and the next fades in.
 */
export function subtitleSeq(c: CanvasRenderingContext2D, lines: Line[], t: number, cy: number, o: { size?: number; maxW?: number; hot?: string; done?: string; dim?: string } = {}) {
  let k = -1;
  for (let i = 0; i < lines.length; i++) if (t >= lines[i]!.start - 0.22) k = i;
  if (k < 0) return;
  const L = lines[k]!, next = lines[k + 1];
  const holdTo = next ? Math.min(next.start - 0.22, L.end + 0.6) : L.end + 0.6;
  const fadeIn = k > 0 && t < L.start ? 1 : prog(t, L.start - 0.22, L.start - 0.02);
  const fadeOut = t > holdTo ? clamp(1 - (t - holdTo) / 0.18) : 1;
  // subtitle() fades by the line's own times: hand it a copy whose window covers the hold
  subtitle(c, { ...L, start: L.start - 0.25 + 0.25 * 0, end: 1e9 } as Line, t, cy, { ...o, a: fadeIn * fadeOut });
}
