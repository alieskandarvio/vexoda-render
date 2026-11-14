// HESIT — «التردّد مكلف» / «Hesitation is expensive»: a light, minimal kinetic-typography reel on a voiceover
// (after the «Attention is expensive» faceless edit: white field, black type, ONE green — here the brand lime —
// a serif-italic contrast word, a clock, a focus frame, a counter ring, hexagon callouts, pills, a circled payoff).
// Every word appears when it is said (data/lyrics.json, Gemini TTS «Charon» timed by whisper): the screen IS the
// transcript. The same file serves both cuts: LANG picks the face, the direction and the line layouts.
//   SH0  line 0      the hook, big; lime arcs draw in at the corners
//   SH1  line 1      a watch dial, the hand ticking on the music's beats; «كلّ ثانيةٍ» in the italic
//   SH2  line 2      a candle chart that keeps moving; the lime focus frame cannot hold the last candle
//   SH3  line 3      a ring that fills over the line: 0.00 → 1.00 s
//   SH4  lines 4–6   three lime hexagons with callouts: the entry, the momentum, the opportunity
//   SH5  line 7      the professionals, one glowing word at a time
//   SH6  line 8      «ليسوا أسرع.» in the italic, wiped in
//   SH7  lines 9–14  the turn on the music's lift: one pill per line, lime / outline
//   SH8  lines 15–16 the sentence, pushed aside by the payoff; the lime ellipse drawn around it
//   SH9  line 17     the lockup (lime V, ink letters), the address, the risk line
// Everything is a pure function of t (no state).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';
import type { Word, Line } from '../engine/lyrics';

const LANG = 'ar' as 'ar' | 'en';
const AR = LANG === 'ar';

// ------------------------------------------------------------------ palette (sRGB for the 2D layer)
const INK = '#141414', LIME = '#92C720', LIME_D = '#6F9A12', PAPER = '#F4F4F1', TRACK = '#E2E4DF';

// ------------------------------------------------------------------ the field: warm white, two soft lime arcs
const FIELD = /* glsl */ `
uniform float t; uniform vec4 r1; uniform vec4 r2; uniform float spin; uniform vec3 glow; uniform float zoom;
float arc(vec2 p, vec4 r, float rot) {
  vec2 d = p - r.xy; float a = atan(d.y, d.x);
  float band = exp(-pow((length(d) - r.z) / 46.0, 2.0));
  float open = smoothstep(-0.35, 0.55, sin(a + rot));           // a C, not an O: the ring opens and turns
  return band * open * r.w;
}
void main() {
  vec2 p0 = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec2 p = (p0 - vec2(${W / 2}.0, ${H / 2}.0)) / zoom + vec2(${W / 2}.0, ${H / 2}.0);
  vec3 paper = vec3(0.9047, 0.9047, 0.8796);                      // #F4F4F1 (linear)
  vec3 lime = vec3(0.2874, 0.5711, 0.0144);                       // #92C720 (linear)
  float v = length((p0 - vec2(${W / 2}.0, ${H / 2}.0)) / vec2(${W}.0, ${H}.0));
  vec3 c = paper * (1.0 - 0.07 * smoothstep(0.25, 0.75, v));
  float k = arc(p, r1, spin) + arc(p, r2, -spin * 0.9 + 3.14159);
  c = mix(c, mix(c, lime, 0.5), clamp(k, 0.0, 1.0));
  // a soft lime light behind the glowing words / the ring
  vec2 g = (p - glow.xy) / vec2(420.0, 300.0);
  c = mix(c, mix(c, lime, 0.35), glow.z * exp(-dot(g, g)));
  fragColor = vec4(c, 1.0);
}`;

// ------------------------------------------------------------------ the type
const MF = (wt: number) => (AR ? `CairoV@${wt}` : `Artegra-${Math.round(clamp(wt, 300, 900) / 100) * 100}`);
const CF = AR ? 'AmiriItalic-700' : 'CormorantItalic-600';
const CF_SCALE = AR ? 1.12 : 1.3;                                   // the italic faces sit smaller on the body
const SZ = AR ? 1 : 0.76;                                           // Artegra is an extended face: smaller px for the same width
const isLatin = (s: string) => /[A-Za-z]/.test(s);

type Tok = { s: string; f: string; size: number; col: string; w: number; x: number; y: number; t0: number; latin: boolean; contrast: boolean };
type RowSpec = { words: number[]; size: number; wt?: number; contrast?: number[]; accent?: number[] };

/** Per-language layouts: which words of each line share a row, and which are lime / italic. */
const LAYOUT: Record<number, { rows: RowSpec[] }> = AR ? {
  0: { rows: [{ words: [0, 1], size: 128, wt: 800, accent: [1] }] },
  1: { rows: [{ words: [0], size: 58, wt: 700 }, { words: [1, 2], size: 104, contrast: [1, 2], accent: [1, 2] }, { words: [3, 4], size: 58, wt: 600 }] },
  2: { rows: [{ words: [0], size: 76, wt: 700 }, { words: [1, 2], size: 76, wt: 600, contrast: [1], accent: [1] }] },
  3: { rows: [{ words: [0, 1, 2, 3], size: 66, wt: 600, contrast: [1], accent: [1] }] },
  8: { rows: [{ words: [0, 1], size: 132, contrast: [0, 1] }] },
  15: { rows: [{ words: [0, 1, 2, 3], size: 60, wt: 600, accent: [1] }] },
  16: { rows: [{ words: [0, 1], size: 118, wt: 800 }] },
  17: { rows: [{ words: [0, 1, 2], size: 58, wt: 600, accent: [1] }] },
} : {
  0: { rows: [{ words: [0], size: 128, wt: 800 }, { words: [1, 2], size: 128, wt: 800, accent: [2] }] },
  1: { rows: [{ words: [0], size: 58, wt: 700 }, { words: [1, 2], size: 104, contrast: [1, 2], accent: [1, 2] }, { words: [3, 4], size: 58, wt: 600 }] },
  2: { rows: [{ words: [0, 1, 2], size: 76, wt: 700 }, { words: [3, 4, 5], size: 76, wt: 600, contrast: [3], accent: [3] }] },
  3: { rows: [{ words: [0, 1, 2, 3, 4], size: 66, wt: 600, contrast: [2], accent: [2] }] },
  8: { rows: [{ words: [0, 1], size: 132, contrast: [0, 1] }] },
  15: { rows: [{ words: [0, 1, 2], size: 60, wt: 600, accent: [1] }, { words: [3, 4], size: 60, wt: 600 }] },
  16: { rows: [{ words: [0, 1], size: 118, wt: 800 }] },
  17: { rows: [{ words: [0, 1, 2], size: 58, wt: 600, accent: [2] }] },
};
const HEX_LABELS = AR ? ['نقطة الدخول', 'الزخم', 'الفرصة'] : ['Your entry', 'Your momentum', 'Your opportunity'];
const HEX_ICONS = ['crosshair', 'trend-up', 'hand-coins'];
const PILL_LIME = [true, false, false, true, true, false];          // lines 9..14 (the reference's green / outline rhythm)
const RISK = AR ? 'التداول ينطوي على مخاطر عالية، وقد تخسر رأس مالك.' : 'Trading involves high risk, and you may lose your capital.';

/** Measure + place a line's rows. align: 'center' about x, or 'start' (x = the start edge: right in Arabic). */
function placeRows(c: CanvasRenderingContext2D, line: Line, rows: RowSpec[], x: number, y: number, o: { align?: 'center' | 'start'; gap?: number; maxW?: number; scale?: number } = {}) {
  const toks: Tok[] = [];
  let yy = y;
  rows.forEach((r, ri) => {
    const sc = (o.scale ?? 1) * SZ;
    let parts = r.words.map((wi) => {
      const w = line.words[wi]!, contrast = !!r.contrast?.includes(wi), latin = isLatin(w.w);
      const f = contrast ? CF : latin && AR ? 'Artegra-700' : MF(r.wt ?? 600);
      const size = r.size * sc * (contrast ? CF_SCALE : 1) * (latin && AR ? 0.8 : 1);
      c.font = font(f, size); c.direction = AR && !latin ? 'rtl' : 'ltr';
      return { s: w.w, f, size, col: r.accent?.includes(wi) ? LIME : INK, w: c.measureText(w.w).width, x: 0, y: 0, t0: w.start, latin, contrast };
    });
    const sp = r.size * sc * 0.28;
    let tot = parts.reduce((a, p) => a + p.w, 0) + sp * (parts.length - 1);
    const maxW = o.maxW ?? W - 140;
    if (tot > maxW) { const k = maxW / tot; parts = parts.map((p) => ({ ...p, size: p.size * k, w: p.w * k })); tot = maxW; }
    const rowH = Math.max(...parts.map((p) => p.size)) * 1.12;
    if (ri) yy += rowH * 0.5;
    // reading order: Arabic runs right → left
    let cur = (o.align ?? 'center') === 'center' ? (AR ? x + tot / 2 : x - tot / 2) : x;
    for (const p of parts) {
      p.x = AR ? cur - p.w : cur; p.y = yy;
      cur += (AR ? -1 : 1) * (p.w + sp * (p.size / (r.size * sc)));
      toks.push(p);
    }
    yy += rowH * 0.5 + (o.gap ?? 0);
  });
  return toks;
}

/** A word arrives when it is said: out of a soft blur, a few px of rise. */
function drawTok(c: CanvasRenderingContext2D, p: Tok, t: number, o: { lead?: number; dur?: number; alpha?: number; col?: string; glow?: number } = {}) {
  const k = prog(t, p.t0 - (o.lead ?? 0.06), p.t0 - (o.lead ?? 0.06) + (o.dur ?? 0.2));
  if (k <= 0) return;
  const e = ease.outCubic(k);
  c.save();
  c.globalAlpha *= e * (o.alpha ?? 1);
  c.font = font(p.f, p.size); c.direction = AR && !p.latin ? 'rtl' : 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle';
  const col = o.col ?? p.col;
  if (o.glow) { c.save(); c.filter = `blur(${o.glow}px)`; c.globalAlpha *= 0.75; c.fillStyle = col; c.fillText(p.s, p.x, p.y + (1 - e) * 14); c.restore(); }
  if (k < 1) c.filter = `blur(${(1 - e) * 10}px)`;
  c.fillStyle = col;
  c.fillText(p.s, p.x, p.y + (1 - e) * 14);
  c.restore();
  if (k < 1) MOTION.fast = true;
}

function hexPath(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 3; c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
  c.closePath();
}

const h01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export default class Hesit extends Scene {
  bg = new FSPass(FIELD, { t: { value: 0 }, r1: { value: [0, 0, 0, 0] }, r2: { value: [0, 0, 0, 0] }, spin: { value: 0 }, glow: { value: [0, 0, 0] }, zoom: { value: 1 } });
  ui = new Layer2D();
  logo!: Logo;
  icons: HTMLImageElement[] = [];
  L: Line[] = [];
  C: number[] = [];                       // the cut before each line

  override async init() {
    this.logo = await loadLogo();
    this.icons = await Promise.all(HEX_ICONS.map(async (n) => {
      const svg = (await (await fetch(`icons/ph/${n}.svg`)).text()).replace(/fill="currentColor"/, 'fill="#FFFFFF"').replace(/<svg /, '<svg width="256" height="256" ');
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode(); return img;
    }));
    this.L = this.ctx.lyrics.lines;
    this.C = this.L.map((l, i) => {
      const prev = this.L[i - 1];
      const gap = prev ? l.start - prev.end : 1;
      return Math.max(0, l.start - Math.min(0.18, Math.max(0.04, gap * 0.45)));
    });
  }

  /** The music's beat at or before t (the clock ticks on it). */
  beatIndex(t: number) {
    const b = this.ctx.audio.beats;
    let i = 0; while (i + 1 < b.length && b[i + 1]! <= t) i++;
    return { i, t0: b[i] ?? 0 };
  }

  // ================================================================ SH0 · the hook
  sh0(c: CanvasRenderingContext2D, t: number, t1: number) {
    const l = this.L[0]!;
    const toks = placeRows(c, l, LAYOUT[0]!.rows, W / 2, AR ? H / 2 : H / 2 - 70);
    const out = prog(t, t1 - 0.14, t1, ease.inQuad);
    c.save(); c.globalAlpha = 1 - out; c.filter = out > 0 ? `blur(${out * 14}px)` : 'none';
    for (const p of toks) drawTok(c, p, t, { lead: 0.1, dur: 0.26 });
    c.restore();
    // a few «$» drifting up beside the costly word
    const acc = toks.find((p) => p.col === LIME)!;
    for (let i = 0; i < 4; i++) {
      const s0 = acc.t0 + 0.1 + i * 0.16, k = prog(t, s0, s0 + 1.1);
      if (k <= 0 || k >= 1) continue;
      const x = acc.x + acc.w * (0.15 + 0.7 * h01(i + 3)), y = acc.y - acc.size * 0.55 - k * 120;
      c.save(); c.globalAlpha = Math.sin(Math.PI * k) * 0.85 * (1 - out); c.font = font(AR ? 'Artegra-600' : 'Artegra-600', 30 + 10 * h01(i)); c.fillStyle = LIME_D;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', x, y); c.restore();
    }
    const zoom = lerp(1.16, 1.0, ease.inOutCubic(prog(t, 0, Math.min(t1, 2.1))));
    const ak = ease.outCubic(prog(t, 0.0, 0.9));
    return { zoom, r1: [150, 360, 250 * lerp(0.6, 1, ak), 0.55 * ak], r2: [940, 1580, 250 * lerp(0.6, 1, ak), 0.55 * ak], spin: 1.2 + t * 0.9 };
  }

  // ================================================================ SH1 · the watch dial
  sh1(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const u = t - t0, D = t1 - t0;
    const cx = 300, cy = 520, R = 760;
    const enter = ease.outCubic(prog(u, 0, 0.35)), out = prog(t, t1 - 0.16, t1, ease.inCubic);
    c.save();
    // camera: a slow roll, then the whip out
    c.translate(cx, cy); c.rotate((-2 + 4 * (u / D)) * Math.PI / 180 + out * 0.5); c.scale(lerp(1.08, 1, enter) * (1 + out * 0.25), lerp(1.08, 1, enter) * (1 + out * 0.25)); c.translate(-cx, -cy);
    c.globalAlpha = enter * (1 - out * 0.9);
    // ticks
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, major = i % 10 === 0;
      const r0 = R - (major ? 70 : 34), r1 = R - 12;
      c.strokeStyle = major ? INK : 'rgba(20,20,20,0.35)'; c.lineWidth = major ? 6 : 2.4;
      c.beginPath(); c.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); c.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); c.stroke();
    }
    // the rim, and its lime segment with three beads
    c.strokeStyle = 'rgba(20,20,20,0.18)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R + 18, 0, Math.PI * 2); c.stroke();
    const a0 = -0.62, a1 = a0 + 0.95 * ease.outCubic(prog(u, 0.1, 0.8));
    c.strokeStyle = LIME; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, R + 18, a0, a1); c.stroke();
    [0.12, 0.5, 0.88].forEach((f) => {
      const a = a0 + 0.95 * f; if (a > a1) return;
      c.fillStyle = PAPER; c.strokeStyle = LIME_D; c.lineWidth = 4;
      c.beginPath(); c.arc(cx + (R + 18) * Math.cos(a), cy + (R + 18) * Math.sin(a), 13, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    // the second hand: ticks on the beat, with a little overshoot
    const { i: bi, t0: bt } = this.beatIndex(t);
    const step = (Math.PI * 2) / 60;
    const kick = 1 + 0.18 * Math.exp(-(t - bt) * 18) * Math.sin((t - bt) * 40);
    const ang = -Math.PI / 2 + 0.35 + step * (bi + Math.min(1, (t - bt) * 22) * kick - 1) * 1.0;
    c.save(); c.translate(cx, cy); c.rotate(ang);
    c.fillStyle = INK;
    c.beginPath(); c.moveTo(-90, -7); c.lineTo(R - 120, -3); c.lineTo(R - 60, 0); c.lineTo(R - 120, 3); c.lineTo(-90, 7); c.closePath(); c.fill();
    // the diamond on the needle
    c.save(); c.translate(R - 250, 0); c.strokeStyle = INK; c.lineWidth = 6; c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(-48, 0); c.lineTo(0, -16); c.lineTo(48, 0); c.lineTo(0, 16); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.restore();
    c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = LIME; c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.fill();
    c.restore();
    // the line, low on the right
    const toks = placeRows(c, this.L[1]!, LAYOUT[1]!.rows, AR ? W - 96 : 430, 1430, { align: 'start', maxW: AR ? W - 200 : W - 430 - 70, gap: 6 });
    c.save(); c.globalAlpha = 1 - out; if (out > 0) c.filter = `blur(${out * 12}px)`;
    for (const p of toks) drawTok(c, p, t);
    c.restore();
    return { zoom: 1 + 0.03 * (u / D), spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH2 · the chart that will not wait
  sh2(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const u = t - t0;
    const enter = ease.outCubic(prog(u, 0, 0.3)), out = prog(t, t1 - 0.14, t1, ease.inCubic);
    const toks = placeRows(c, this.L[2]!, LAYOUT[2]!.rows, W / 2, 470, { gap: 8 });
    // the chart: a new candle every 0.3 s at the right end, the whole tape sliding left (time runs left → right in
    // both languages: charts never flip)
    const X0 = 90, X1 = W - 90, Y0 = 730, Y1 = 1380, pitch = 66, bw = 36, every = 0.3;
    const pos = u / every, kN = Math.floor(pos), fr = pos - kN;
    const price = (k: number) => 0.5 + 0.2 * Math.sin(k * 0.23) + 0.13 * Math.sin(k * 0.61 + 1.3) + (h01(k) - 0.5) * 0.14;
    const yv = (v: number) => lerp(Y1, Y0, v);
    const xOf = (k: number) => X1 - 80 - (kN - k + ease.inOutSine(fr)) * pitch;
    c.save(); c.globalAlpha = enter * (1 - out); if (out > 0) c.filter = `blur(${out * 12}px)`;
    c.beginPath(); c.rect(X0, Y0 - 80, X1 - X0, Y1 - Y0 + 160); c.clip();
    for (let k = kN - 16; k <= kN + 1; k++) {
      const x = k === kN + 1 ? X1 - 80 : xOf(k);
      const grow = k === kN + 1 ? ease.outCubic(clamp((fr - 0.55) / 0.45)) : 1;
      if (grow <= 0 || x < X0 - 40) continue;
      const o = price(k), cl = lerp(o, price(k + 1), grow), hi = Math.max(o, cl) + 0.05 * h01(k + 9) * grow, lo = Math.min(o, cl) - 0.05 * h01(k + 17) * grow;
      const up = price(k + 1) >= o;
      c.strokeStyle = up ? LIME_D : INK; c.fillStyle = up ? LIME : INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, yv(hi)); c.lineTo(x, yv(lo)); c.stroke();
      const top = yv(Math.max(o, cl)), bot = yv(Math.min(o, cl));
      c.fillRect(x - bw / 2, top, bw, Math.max(4, bot - top));
    }
    c.restore();
    // a soft fade where the old candles leave
    c.save(); c.globalCompositeOperation = 'destination-out';
    const fg = c.createLinearGradient(X0, 0, X0 + 220, 0); fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fg; c.fillRect(X0 - 60, Y0 - 90, 280, Y1 - Y0 + 180); c.restore();
    // the last price, and the lime focus frame on the newest candle: it locks, then the tape moves out from under it
    const lastY = yv(price(kN + 1));
    c.save(); c.globalAlpha = enter * (1 - out);
    c.setLineDash([10, 10]); c.strokeStyle = 'rgba(20,20,20,0.32)'; c.lineWidth = 2; c.beginPath(); c.moveTo(X0 + 120, lastY); c.lineTo(X1, lastY); c.stroke(); c.setLineDash([]);
    const lock = ease.outBack(prog(u, 0.15, 0.5));
    const fx = X1 - 80 - 0.5 * pitch, fy = lerp(yv(price(kN)), lastY, ease.inOutSine(fr));
    const bwF = lerp(460, 220, lock), bhF = lerp(620, 340, lock), Lc = 48;
    c.strokeStyle = LIME; c.lineWidth = 7; c.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const px = fx + sx * bwF / 2, py = fy + sy * bhF / 2;
      c.beginPath(); c.moveTo(px, py - sy * Lc); c.lineTo(px, py); c.lineTo(px - sx * Lc, py); c.stroke();
    }
    c.restore();
    c.save(); c.globalAlpha = 1 - out; if (out > 0) c.filter = `blur(${out * 12}px)`;
    for (const p of toks) drawTok(c, p, t);
    c.restore();
    return { zoom: 1 + 0.02 * u, spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH3 · one second, filling
  sh3(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const l = this.L[3]!, u = t - t0;
    const enter = ease.outBack(prog(u, 0, 0.32)), out = prog(t, t1 - 0.14, t1, ease.inCubic);
    const cx = W / 2, cy = 820, R = 220;
    const fill = ease.inOutSine(prog(t, l.start, l.end + 0.15));
    c.save(); c.translate(cx, cy); c.scale(lerp(0.6, 1, enter) * (1 - out * 0.3), lerp(0.6, 1, enter) * (1 - out * 0.3)); c.globalAlpha = clamp(enter) * (1 - out);
    if (out > 0) c.filter = `blur(${out * 12}px)`;
    c.strokeStyle = TRACK; c.lineWidth = 26; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    if (fill > 0) {
      c.lineCap = 'round';
      c.save(); c.filter = 'blur(14px)'; c.globalAlpha *= 0.6; c.strokeStyle = LIME; c.lineWidth = 30; c.beginPath(); c.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); c.stroke(); c.restore();
      c.strokeStyle = LIME; c.lineWidth = 26; c.beginPath(); c.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); c.stroke();
      // the head bead
      const a = -Math.PI / 2 + fill * Math.PI * 2;
      c.fillStyle = PAPER; c.strokeStyle = LIME_D; c.lineWidth = 5; c.beginPath(); c.arc(R * Math.cos(a), R * Math.sin(a), 15, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.font = font('Artegra-700', 118); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillStyle = INK;
    c.fillText(fill.toFixed(2), 0, 4);
    c.font = font(AR ? 'CairoV@600' : 'Artegra-500', AR ? 40 : 30); c.fillStyle = 'rgba(20,20,20,0.5)'; c.direction = AR ? 'rtl' : 'ltr';
    c.fillText(AR ? 'ثانية' : 'second', 0, 104);
    c.restore();
    const toks = placeRows(c, l, LAYOUT[3]!.rows, W / 2, 1180);
    c.save(); c.globalAlpha = 1 - out; if (out > 0) c.filter = `blur(${out * 12}px)`;
    for (const p of toks) drawTok(c, p, t);
    c.restore();
    return { zoom: 1 + 0.02 * u, glow: [cx, cy, 0.5 * fill * (1 - out)], spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH4 · what the second costs
  sh4(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const u = t - t0;
    const out = prog(t, t1 - 0.2, t1, ease.inCubic);
    const P = [[W / 2 - 205, 830], [W / 2 + 205, 830], [W / 2, 1185]] as const;
    const order = AR ? [1, 0, 2] : [0, 1, 2];                          // the first said lands at the reading start
    const r = 150;
    for (let j = 0; j < 3; j++) {
      const [x, y] = P[order[j]!]!;
      const w0 = this.L[4 + j]!.start - 0.05;
      const k = prog(t, w0, w0 + 0.34), e = ease.outBack(k);
      if (k <= 0) continue;
      const ok = clamp(1 - prog(t, t1 - 0.22 + j * 0.03, t1 - 0.04 + j * 0.03, ease.inCubic));
      c.save(); c.translate(x, y); c.scale(e * ok, e * ok); c.globalAlpha = clamp(k * 3) * ok;
      // the extruded lime hexagon
      c.save(); c.translate(0, 16); hexPath(c, 0, 0, r); c.fillStyle = '#4E700A'; c.fill(); c.restore();
      hexPath(c, 0, 0, r); c.fillStyle = LIME; c.fill();
      c.save(); hexPath(c, 0, 0, r); c.clip(); const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 80, 0, Math.PI * 2); c.stroke();
      c.drawImage(this.icons[j]!, -54, -54, 108, 108);
      c.restore();
      // the callout: up-and-out for the top two, down-and-out for the third
      const lk = ease.outCubic(prog(t, w0 + 0.18, w0 + 0.42)) * ok;
      if (lk <= 0) continue;
      const below = order[j] === 2, side = order[j] === 0 ? -1 : 1;
      const sy = below ? y + r + 6 : y - r - 6, my = below ? sy + 46 : sy - 46, ex = x + side * 70, ey = below ? my + 44 : my - 44;
      c.save(); c.globalAlpha = lk; c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, sy); c.lineTo(x, lerp(sy, my, clamp(lk * 2))); if (lk > 0.5) c.lineTo(lerp(x, ex, (lk - 0.5) * 2), lerp(my, ey, (lk - 0.5) * 2)); c.stroke();
      c.font = font(AR ? 'CairoV@700' : 'Artegra-600', AR ? 46 : 34); c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = AR ? 'rtl' : 'ltr';
      c.globalAlpha = prog(t, w0 + 0.3, w0 + 0.5) * ok;
      c.fillText(HEX_LABELS[j]!, ex + side * 20, below ? ey + 40 : ey - 36);
      c.restore();
    }
    return { zoom: lerp(1.06, 1.0, ease.outCubic(prog(u, 0, 1.5))) * (1 - 0.04 * out), spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH5 · the professionals, word by word, glowing
  sh5(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const l = this.L[7]!;
    const ws = l.words;
    let glow = 0;
    ws.forEach((w, i) => {
      const next = ws[i + 1]?.start ?? t1;
      const kin = prog(t, w.start - 0.08, w.start + 0.16), kout = prog(t, next - 0.1, next + 0.02);
      if (kin <= 0 || kout >= 1) return;
      const e = ease.outCubic(kin);
      const size = (AR ? 132 : 104) * (AR || !isLatin(w.w) ? 1 : 1);
      const f = AR ? 'CairoV@800' : 'Artegra-800';
      c.save(); c.font = font(f, size); c.direction = AR ? 'rtl' : 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(w.w).width, sc = Math.min(1, (W - 140) / tw) * lerp(1.14, 1, e) * (1 - 0.1 * kout);
      c.translate(W / 2, H / 2); c.scale(sc, sc);
      c.globalAlpha = e * (1 - kout);
      c.save(); c.filter = 'blur(26px)'; c.globalAlpha *= 0.85; c.fillStyle = LIME; c.fillText(w.w, 0, 0); c.restore();
      c.filter = `blur(${(1 - e) * 12 + kout * 14}px)`;
      c.fillStyle = LIME_D; c.fillText(w.w, 0, 0);
      c.restore();
      glow = Math.max(glow, e * (1 - kout));
      if (kin < 1 || kout > 0) MOTION.fast = true;
    });
    return { zoom: 1 + 0.03 * prog(t, t0, t1), glow: [W / 2, H / 2, 0.55 * glow], spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH6 · «ليسوا أسرع.» — the italic, wiped in
  sh6(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const l = this.L[8]!;
    const toks = placeRows(c, l, LAYOUT[8]!.rows, W / 2, H / 2);
    const out = prog(t, t1 - 0.12, t1, ease.inCubic);
    const x0 = Math.min(...toks.map((p) => p.x)), x1 = Math.max(...toks.map((p) => p.x + p.w));
    const k = ease.inOutCubic(prog(t, l.start - 0.05, l.start + 0.5));
    c.save(); c.globalAlpha = 1 - out; if (out > 0) c.filter = `blur(${out * 12}px)`;
    for (const p of toks) drawTok(c, { ...p, t0: l.start - 0.2 }, t, { lead: 0, dur: 0.01 });
    c.restore();
    // the wipe in the reading direction with a soft edge
    const edge = AR ? lerp(x1 + 40, x0 - 160, k) : lerp(x0 - 40, x1 + 160, k);
    c.save(); c.globalCompositeOperation = 'destination-out';
    const g = AR ? c.createLinearGradient(edge, 0, edge - 160, 0) : c.createLinearGradient(edge, 0, edge + 160, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g;
    if (AR) c.fillRect(0, H / 2 - 160, edge, 320); else c.fillRect(edge, H / 2 - 160, W - edge, 320);
    c.restore();
    if (k < 1) MOTION.fast = true;
    return { zoom: lerp(1.04, 1.0, ease.outCubic(prog(t, t0, t1))), spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH7 · the turn: one pill per line
  sh7(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const u = t - t0;
    const fs = AR ? 50 : 36, ph = AR ? 116 : 104, padX = AR ? 50 : 44, gap = 20, maxRow = W - 110;
    const f = AR ? 'CairoV@700' : 'Artegra-600';
    c.save(); c.font = font(f, fs); c.direction = AR ? 'rtl' : 'ltr';
    const pills = [9, 10, 11, 12, 13, 14].map((li, i) => {
      const txt = this.L[li]!.text;
      return { txt, w: c.measureText(txt).width + padX * 2, lime: PILL_LIME[i]!, t0: this.L[li]!.start, li };
    });
    c.restore();
    // pack into rows in reading order
    const rows: (typeof pills)[] = [];
    let cur: typeof pills = [], cw = 0;
    for (const p of pills) {
      if (cur.length && cw + gap + p.w > maxRow) { rows.push(cur); cur = []; cw = 0; }
      cw += (cur.length ? gap : 0) + p.w; cur.push(p);
    }
    if (cur.length) rows.push(cur);
    const rh = ph + 26, top = H / 2 - (rows.length * rh - 24) / 2 + ph / 2;
    const out = prog(t, t1 - 0.2, t1, ease.inCubic);
    rows.forEach((row, ri) => {
      const rowW = row.reduce((a, p) => a + p.w, 0) + gap * (row.length - 1);
      const last = ri === rows.length - 1 && rows.length > 2;
      // rows start at the reading start; the last row steps to the other side (the reference's stagger)
      let x = AR ? (last ? 55 + rowW : W - 55) : (last ? W - 55 - rowW : 55);
      for (const p of row) {
        const px = AR ? x - p.w : x;
        x += (AR ? -1 : 1) * (p.w + gap);
        const k = prog(t, p.t0 - 0.08, p.t0 + 0.26);
        if (k <= 0) continue;
        const e = ease.outBack(k), y = top + ri * rh;
        const ok = 1 - clamp(out * 1.6 - ri * 0.12);
        c.save();
        c.translate(px + p.w / 2, y); c.scale(lerp(0.72, 1, e) * lerp(1, 0.86, 1 - ok), lerp(0.72, 1, e) * lerp(1, 0.86, 1 - ok));
        c.globalAlpha = clamp(k * 2.5) * ok;
        if (k < 1 || ok < 1) c.filter = `blur(${(1 - clamp(k * 1.4)) * 10 + (1 - ok) * 14}px)`;
        c.beginPath(); c.roundRect(-p.w / 2, -ph / 2, p.w, ph, ph / 2);
        if (p.lime) { c.fillStyle = LIME; c.fill(); }
        else { c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke(); }
        c.font = font(f, fs); c.direction = AR ? 'rtl' : 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK;
        c.fillText(p.txt, 0, AR ? 3 : 2);
        c.restore();
        if (k < 1) MOTION.fast = true;
      }
    });
    const ak = ease.outCubic(prog(u, 0, 0.8)) * (1 - out);
    return { zoom: 1 + 0.035 * prog(t, t0, t1, ease.inOutSine), spin: 0.6 + u * 0.7, r1: [980, 300, 260, 0.5 * ak], r2: [90, 1640, 260, 0.5 * ak] };
  }

  // ================================================================ SH8 · clarity → the payoff, circled
  sh8(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const lA = this.L[15]!, lB = this.L[16]!;
    const push = ease.inOutCubic(prog(t, lB.start - 0.18, lB.start + 0.22));
    const out = prog(t, t1 - 0.14, t1, ease.inCubic);
    const tA = placeRows(c, lA, LAYOUT[15]!.rows, W / 2, H / 2, { gap: 6 });
    const wA = Math.max(...tA.map((p) => p.x + p.w)) - Math.min(...tA.map((p) => p.x));
    const dir = AR ? 1 : -1;                                           // the old line leaves toward the reading start
    c.save(); c.translate(dir * push * (wA / 2 + 330), 0); c.globalAlpha = lerp(1, 0.28, push) * (1 - out); if (push > 0) c.filter = `blur(${push * 4}px)`;
    for (const p of tA) drawTok(c, p, t);
    c.restore();
    const tB = placeRows(c, lB, LAYOUT[16]!.rows, W / 2, H / 2);
    // the payoff only shows once the old line has made room (never on top of it)
    c.save(); c.translate(-dir * (1 - push) * 420, 0); c.globalAlpha = (1 - out) * prog(push, 0.3, 0.75);
    for (const p of tB) drawTok(c, p, t, { lead: 0.14, dur: 0.24 });
    c.restore();
    // the lime ellipse, drawn around the payoff
    const x0 = Math.min(...tB.map((p) => p.x)), x1 = Math.max(...tB.map((p) => p.x + p.w));
    const ek = ease.inOutCubic(prog(t, lB.start + 0.12, lB.start + 0.7));
    if (ek > 0) {
      const rx = (x1 - x0) / 2 + 66, ry = 112, cx = (x0 + x1) / 2, cy = H / 2 + 4;
      const a0 = AR ? -0.35 : Math.PI + 0.35, sweep = (AR ? 1 : -1) * Math.PI * 2.08 * ek;
      c.save(); c.globalAlpha = 1 - out; c.translate(cx, cy); c.rotate(-0.05);
      c.save(); c.filter = 'blur(16px)'; c.globalAlpha *= 0.6; c.strokeStyle = LIME; c.lineWidth = 16; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a0 + sweep, sweep < 0); c.stroke(); c.restore();
      c.strokeStyle = LIME; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a0 + sweep, sweep < 0); c.stroke();
      c.restore();
      if (ek < 1) MOTION.fast = true;
    }
    return { zoom: 1 + 0.03 * prog(t, lB.start, t1), glow: [W / 2, H / 2, 0.35 * ek * (1 - out)], spin: 0, r1: [0, 0, 0, 0], r2: [0, 0, 0, 0] };
  }

  // ================================================================ SH9 · the lockup
  sh9(c: CanvasRenderingContext2D, t: number, t0: number) {
    const l = this.L[17]!;
    const toks = placeRows(c, l, LAYOUT[17]!.rows, W / 2, H / 2 - 200);
    for (const p of toks) drawTok(c, p, t);
    const vx = l.words[l.words.length - 1]!.start - 0.04;
    const k = prog(t, vx, vx + 0.9);
    if (k > 0) {
      const lw = 600, L = this.logo, lh = lw * (L.H / L.W);
      c.save(); c.translate(W / 2 - lw / 2, H / 2 - lh / 2 + 10 + (1 - ease.outCubic(prog(t, vx, vx + 0.5))) * 24);
      drawLockup(c, L, lw, { vk: [ease.outCubic(prog(t, vx, vx + 0.35)), ease.outCubic(prog(t, vx + 0.12, vx + 0.47))], lk: [0, 1, 2, 3, 4].map((i) => prog(t, vx + 0.2 + i * 0.07, vx + 0.55 + i * 0.07)), vCol: LIME, lCol: INK });
      c.restore();
      const k2 = ease.outCubic(prog(t, vx + 0.6, vx + 1.0));
      c.save(); c.globalAlpha = k2 * 0.85; c.font = font('Artegra-600', 34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillStyle = INK;
      c.fillText('vexoda.com', W / 2, H / 2 + lh / 2 + 90); c.restore();
      c.save(); c.globalAlpha = k2 * 0.55; c.font = font(AR ? 'CairoV@500' : 'Artegra-500', AR ? 31 : 23); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = AR ? 'rtl' : 'ltr'; c.fillStyle = INK;
      c.fillText(RISK, W / 2, H - 300); c.restore();
      if (k < 1) MOTION.fast = true;
    }
    const ak = ease.outCubic(prog(t, t0, t0 + 1.0));
    return { zoom: 1 + 0.02 * prog(t, t0, this.ctx.end), spin: 2.0 + t * 0.5, r1: [140, 380, 240, 0.45 * ak], r2: [950, 1560, 240, 0.45 * ak] };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const U = this.ui; U.clear();
    const c = U.ctx, C = this.C, END = this.ctx.end;
    const cuts = [C[1]!, C[2]!, C[3]!, C[4]!, C[7]!, C[8]!, C[9]!, C[15]!, C[17]!];
    let o: { zoom?: number; spin?: number; r1?: number[]; r2?: number[]; glow?: number[] };
    if (t < cuts[0]!) o = this.sh0(c, t, cuts[0]!);
    else if (t < cuts[1]!) o = this.sh1(c, t, cuts[0]!, cuts[1]!);
    else if (t < cuts[2]!) o = this.sh2(c, t, cuts[1]!, cuts[2]!);
    else if (t < cuts[3]!) o = this.sh3(c, t, cuts[2]!, cuts[3]!);
    else if (t < cuts[4]!) o = this.sh4(c, t, cuts[3]!, cuts[4]!);
    else if (t < cuts[5]!) o = this.sh5(c, t, cuts[4]!, cuts[5]!);
    else if (t < cuts[6]!) o = this.sh6(c, t, cuts[5]!, cuts[6]!);
    else if (t < cuts[7]!) o = this.sh7(c, t, cuts[6]!, cuts[7]!);
    else if (t < cuts[8]!) o = this.sh8(c, t, cuts[7]!, cuts[8]!);
    else o = this.sh9(c, t, cuts[8]!);
    const bu = this.bg.u;
    bu.t!.value = t; bu.zoom!.value = 1; bu.spin!.value = o.spin ?? 0;
    bu.r1!.value = o.r1 ?? [0, 0, 0, 0]; bu.r2!.value = o.r2 ?? [0, 0, 0, 0]; bu.glow!.value = o.glow ?? [0, 0, 0];
    this.bg.render(renderer, out);
    comp.draw(renderer, U.upload(), out);
    const cut = cuts.reduce((m, s) => Math.max(m, pulse(t, s, 0.08)), 0);
    void END;
    return { flat: 1, bloom: 0, halation: 0, ca: 0.12 + 0.8 * cut, grain: 0.025, vignette: 0.08, zoom: (o.zoom ?? 1) * (1 + 0.012 * cut), zblur: 0.35 * cut, fade: 0 };
  }
}
