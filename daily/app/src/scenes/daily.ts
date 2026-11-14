// DAILY — «تحليل اليوم»: the Telegram bot's morning analysis as a daily reel (trial on the analysis for Mon 16/11).
// Data = public/analysis.json: the SAME engine the bot posts from (/api/analysis/forex, h=day) + 72 × 1h candles from
// the bridge (as the bot's scenario card). No number is typed by hand; the voice speaks the scenario, the screen
// carries the numbers. Every spoken word appears under the chart when it is said (data/lyrics.json).
//   line 0  the hook: «تحليل اليوم» + the date + the four markets as tiles (bias + a sparkline)
//   1..4    one market each: the 3-day chart draws in, R2 R1 P S1 S2 + the zones, the scenario path (lime) from
//           the last close to the entry and on to the pivot, the three numbers, the line said
//   5       the lockup, the line said, the risk line
// Everything is a pure function of t.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';
import type { Line } from '../engine/lyrics';

const INK = '#0E0F11', PANEL = '#15171A', EDGE = '#262A2F', BONE = '#F2F3F5', MUTED = 'rgba(242,243,245,0.55)';
const LIME = '#92C720', RES = '#F0715A', SUP = '#2DBFA8', PIV = '#E8B83A';
const ORDER = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
const NAME: Record<string, string> = { XAUUSD: 'الذهب', EURUSD: 'اليورو / الدولار', GBPUSD: 'الإسترليني / الدولار', USDJPY: 'الدولار / الين' };
const BIAS: Record<string, string> = { bull: 'صاعد', bull_lean: 'مائل للصعود', neutral: 'حيادي', bear_lean: 'مائل للهبوط', bear: 'هابط' };
const DATE = 'الاثنين 16 نوفمبر 2026';
const RISK = 'التداول ينطوي على مخاطر عالية، وقد تخسر رأس مالك.';
const isUp = (b: string) => b === 'bull' || b === 'bull_lean';
const isDown = (b: string) => b === 'bear' || b === 'bear_lean';

type An = { name: any; bias: string; dec: number; pivots: Record<string, number>; zones: { kind: string; lo: number; hi: number }[];
  legs: { side: string; entry: number; t1: number; t2: number; invalid: number }[]; price: number; candles: number[][] };

const FIELD = /* glsl */ `
uniform float t; uniform float glowK; uniform vec2 glowP;
void main() {
  vec2 p = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec3 c = vec3(0.0042, 0.0046, 0.0055);
  // a faint terminal grid
  vec2 g = abs(fract(p / 90.0) - 0.5) * 90.0;
  float line = 1.0 - smoothstep(0.0, 1.2, min(g.x, g.y));
  c += vec3(0.010, 0.011, 0.013) * line;
  // a slow lime light, and a cool one
  vec2 a = (p - vec2(820.0 + 60.0 * sin(t * 0.21), 260.0 + 80.0 * sin(t * 0.17))) / vec2(620.0, 520.0);
  c += vec3(0.018, 0.034, 0.002) * exp(-dot(a, a));
  vec2 b = (p - vec2(160.0, 1650.0 + 60.0 * sin(t * 0.19))) / vec2(560.0, 520.0);
  c += vec3(0.004, 0.012, 0.014) * exp(-dot(b, b));
  vec2 q = (p - glowP) / vec2(520.0, 360.0);
  c += vec3(0.03, 0.06, 0.004) * glowK * exp(-dot(q, q));
  float v = length((p - vec2(${W / 2}.0, ${H / 2}.0)) / vec2(${W}.0, ${H}.0));
  c *= 1.0 - 0.35 * smoothstep(0.3, 0.8, v);
  fragColor = vec4(c, 1.0);
}`;

const fmt = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Lay a spoken line out right-to-left in wrapped rows (centred), each word with its time. */
function wrapLine(c: CanvasRenderingContext2D, line: Line, size: number, maxW: number) {
  c.font = font('CairoV@600', size); c.direction = 'rtl';
  const sp = size * 0.27;
  const ws = line.words.map((w) => {
    const latin = /[A-Za-z]/.test(w.w);
    c.font = font(latin ? 'Artegra-700' : 'CairoV@600', latin ? size * 0.82 : size); c.direction = latin ? 'ltr' : 'rtl';
    const m = latin ? /^(.*?)([.,،:]*)$/.exec(w.w)! : null;
    return { s: m ? m[1]! : w.w, p: m ? m[2]! : '', t0: w.start, w: c.measureText(m ? m[1]! : w.w).width + (m && m[2] ? size * 0.22 : 0), latin };
  });
  const rows: (typeof ws)[] = []; let cur: typeof ws = [], cw = 0;
  for (const w of ws) { if (cur.length && cw + sp + w.w > maxW) { rows.push(cur); cur = []; cw = 0; } cw += (cur.length ? sp : 0) + w.w; cur.push(w); }
  if (cur.length) rows.push(cur);
  return { rows, sp };
}
function drawLine(c: CanvasRenderingContext2D, line: Line, t: number, cy: number, o: { size?: number; maxW?: number; alpha?: number; accent?: (s: string) => boolean } = {}) {
  const size = o.size ?? 44, { rows, sp } = wrapLine(c, line, size, o.maxW ?? W - 150), lh = size * 1.55;
  const y0 = cy - ((rows.length - 1) * lh) / 2;
  rows.forEach((r, ri) => {
    const tot = r.reduce((a, w) => a + w.w, 0) + sp * (r.length - 1);
    let x = W / 2 + tot / 2;
    for (const w of r) {
      x -= w.w;
      const k = prog(t, w.t0 - 0.05, w.t0 + 0.16);
      if (k > 0) {
        const e = ease.outCubic(k);
        c.save(); c.globalAlpha *= e * (o.alpha ?? 1);
        c.font = font(w.latin ? 'Artegra-700' : 'CairoV@600', w.latin ? size * 0.82 : size); c.direction = w.latin ? 'ltr' : 'rtl';
        c.textAlign = 'left'; c.textBaseline = 'middle';
        if (k < 1) { c.filter = `blur(${(1 - e) * 8}px)`; MOTION.fast = true; }
        c.fillStyle = o.accent?.(w.s) ? LIME : BONE;
        const pw = w.p ? size * 0.22 : 0;
        c.fillText(w.s, x + pw, y0 + ri * lh + (1 - e) * 10);
        if (w.p) { c.font = font('CairoV@600', size); c.direction = 'rtl'; c.fillStyle = BONE; c.fillText(w.p, x, y0 + ri * lh + (1 - e) * 10); }
        c.restore();
      }
      x -= sp;
    }
  });
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, txt: string, bg: string, fg: string, size: number, align: 'left' | 'right' = 'left') {
  c.font = font('CairoV@700', size); c.direction = 'rtl';
  const w = c.measureText(txt).width + size * 1.3, h = size * 1.7;
  const x0 = align === 'left' ? x : x - w;
  c.fillStyle = bg; c.beginPath(); c.roundRect(x0, y - h / 2, w, h, h / 2); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x0 + w / 2, y + size * 0.06);
  return w;
}

export default class Daily extends Scene {
  bg = new FSPass(FIELD, { t: { value: 0 }, glowK: { value: 0 }, glowP: { value: [W / 2, H / 2] } });
  ui = new Layer2D();
  logo!: Logo;
  A: Record<string, An> = {};
  L: Line[] = [];
  C: number[] = [];

  override async init() {
    this.logo = await loadLogo();
    this.A = await (await fetch('analysis.json')).json();
    this.L = this.ctx.lyrics.lines;
    this.C = this.L.map((l, i) => {
      const prev = this.L[i - 1];
      const gap = prev ? l.start - prev.end : 1;
      return Math.max(0, l.start - Math.min(0.2, Math.max(0.06, gap * 0.45)));
    });
  }

  // ================================================================ the hook: today + four tiles
  hook(c: CanvasRenderingContext2D, t: number, t1: number) {
    const out = prog(t, t1 - 0.18, t1, ease.inCubic);
    c.save(); c.globalAlpha = 1 - out; c.translate(out * 140, 0); if (out > 0) c.filter = `blur(${out * 10}px)`;
    const k0 = ease.outCubic(prog(t, 0.0, 0.45));
    c.globalAlpha *= k0;
    c.font = font('CairoV@900', 124); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = BONE;
    c.fillText('تحليل اليوم', W / 2, 470 + (1 - k0) * 24);
    c.font = font('CairoV@600', 46); c.fillStyle = LIME; c.globalAlpha = (1 - out) * ease.outCubic(prog(t, 0.2, 0.6));
    c.fillText(DATE, W / 2, 590);
    c.restore();
    // the four markets
    const tw = 440, th = 270, gx = 30, gy = 30, x0 = W / 2 - tw - gx / 2, y0 = 720;
    ORDER.forEach((s, i) => {
      const a = this.A[s]!, col = i % 2, row = Math.floor(i / 2);
      const x = col === 0 ? x0 + tw + gx : x0, y = y0 + row * (th + gy);      // reading order: right first
      const k = prog(t, 0.35 + i * 0.16, 0.75 + i * 0.16), e = ease.outBack(k);
      if (k <= 0) return;
      c.save(); c.globalAlpha = clamp(k * 2) * (1 - out); c.translate(x + tw / 2 + out * 140, y + th / 2); c.scale(lerp(0.85, 1, e), lerp(0.85, 1, e)); c.translate(-tw / 2, -th / 2);
      c.fillStyle = PANEL; c.strokeStyle = EDGE; c.lineWidth = 2; c.beginPath(); c.roundRect(0, 0, tw, th, 26); c.fill(); c.stroke();
      let ns = 44; c.font = font('CairoV@800', ns); c.direction = 'rtl';
      while (c.measureText(NAME[s]!).width > tw - 56 && ns > 30) { ns -= 2; c.font = font('CairoV@800', ns); }
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = BONE;
      c.fillText(NAME[s]!, tw - 28, 56);
      const up = isUp(a.bias), dn = isDown(a.bias);
      pill(c, tw - 28, 112, BIAS[a.bias] + (up ? ' ▲' : dn ? ' ▼' : ''), up ? LIME : dn ? RES : '#5A6068', INK, 24, 'right');
      c.font = font('Artegra-500', 22); c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = MUTED; c.fillText(s, 28, 112);
      // the sparkline of the three days
      const cs = a.candles, lo = Math.min(...cs.map((q) => q[3]!)), hi = Math.max(...cs.map((q) => q[2]!));
      c.save(); c.beginPath(); cs.forEach((q, j) => { const px = 28 + (j / (cs.length - 1)) * (tw - 56), py = th - 36 - ((q[4]! - lo) / (hi - lo)) * 110; j ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.strokeStyle = up ? LIME : dn ? RES : BONE; c.lineWidth = 4; c.lineJoin = 'round';
      const sk = prog(t, 0.5 + i * 0.16, 1.2 + i * 0.16);
      c.beginPath(); c.rect(0, 0, 28 + sk * (tw - 56), th); c.clip();
      c.beginPath(); cs.forEach((q, j) => { const px = 28 + (j / (cs.length - 1)) * (tw - 56), py = th - 36 - ((q[4]! - lo) / (hi - lo)) * 110; j ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke(); c.restore();
      c.restore();
      if (k < 1) MOTION.fast = true;
    });
    c.save(); c.globalAlpha = 1 - out; drawLine(c, this.L[0]!, t, 1520, { size: 44, accent: (w) => /VEXODA/.test(w) }); c.restore();
    return { glowK: 0.4 * k0 * (1 - out), glowP: [W / 2, 470] };
  }

  // ================================================================ one market
  market(c: CanvasRenderingContext2D, t: number, t0: number, t1: number, li: number) {
    const s = ORDER[li - 1]!, a = this.A[s]!, d = a.dec, P = a.pivots, line = this.L[li]!;
    const u = t - t0;
    const inK = ease.outCubic(prog(u, 0, 0.32)), out = prog(t, t1 - 0.18, t1, ease.inCubic);
    c.save();
    c.translate(-(1 - inK) * 160 + out * 160, 0); c.globalAlpha = inK * (1 - out);
    if (inK < 1 || out > 0) { c.filter = `blur(${(1 - inK) * 10 + out * 10}px)`; MOTION.fast = true; }
    // header
    c.font = font('CairoV@800', 84); c.direction = 'rtl'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = BONE;
    c.fillText(NAME[s]!, W - 70, 250);
    c.font = font('Artegra-500', 28); c.direction = 'ltr'; c.fillStyle = MUTED; c.fillText(s + '  ·  1H', W - 70, 325);
    const up = isUp(a.bias), dn = isDown(a.bias);
    c.font = font('CairoV@600', 28); c.direction = 'rtl'; c.textAlign = 'left'; c.fillStyle = MUTED; c.fillText('الاتجاه', 70, 220);
    pill(c, 70, 285, BIAS[a.bias] + (up ? ' ▲' : dn ? ' ▼' : ''), up ? LIME : dn ? RES : '#5A6068', INK, 38, 'left');
    c.filter = 'none';
    // the chart panel
    const X0 = 60, X1 = W - 60, Y0 = 390, Y1 = 1180;
    c.fillStyle = PANEL; c.strokeStyle = EDGE; c.lineWidth = 2; c.beginPath(); c.roundRect(X0, Y0, X1 - X0, Y1 - Y0, 28); c.fill(); c.stroke();
    const px0 = X0 + 30, pxN = X0 + 600, pxF = X1 - 150, py0 = Y0 + 50, py1 = Y1 - 50;   // candles | the scenario's room | the tags
    const cs = a.candles;
    const vals = [...cs.map((q) => q[2]!), ...cs.map((q) => q[3]!), P.r2!, P.s2!];
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = (v: number) => lerp(py1, py0, (v - lo) / (hi - lo));
    // zones (soft bands) and levels
    const lk = (i: number) => ease.outCubic(prog(u, 0.55 + i * 0.07, 0.9 + i * 0.07));
    for (const z of a.zones) {
      if (z.hi < lo || z.lo > hi) continue;
      const zy0 = Y(Math.min(hi, z.hi)), zy1 = Y(Math.max(lo, z.lo));
      c.save(); c.globalAlpha *= 0.07 * lk(0); c.fillStyle = z.kind === 'res' ? RES : SUP; c.fillRect(px0, zy0, pxF - px0, zy1 - zy0);
      c.globalAlpha = (c.globalAlpha / 0.07) * 0.28; c.fillRect(px0, zy0, pxF - px0, 1.5); c.fillRect(px0, zy1 - 1.5, pxF - px0, 1.5); c.restore();
    }
    const LV: [string, string, number, string][] = [['R2', 'المقاومة الثانية', P.r2!, RES], ['R1', 'المقاومة الأولى', P.r1!, RES], ['P', 'الارتكاز', P.pp!, PIV], ['S1', 'الدعم الأول', P.s1!, SUP], ['S2', 'الدعم الثاني', P.s2!, SUP]];
    LV.forEach(([tag, , v, col], i) => {
      const k = lk(i); if (k <= 0) return;
      const y = Y(v);
      c.save(); c.globalAlpha *= k; c.strokeStyle = col; c.lineWidth = tag === 'P' ? 3 : 2.2; c.setLineDash(tag === 'P' ? [] : [12, 9]);
      c.beginPath(); c.moveTo(px0, y); c.lineTo(lerp(px0, pxF, k), y); c.stroke(); c.setLineDash([]);
      // the tag on the right edge
      c.font = font('Artegra-600', 22); c.direction = 'ltr'; const txt = `${tag}  ${fmt(v, d)}`; const tw = c.measureText(txt).width + 24;
      c.fillStyle = col; c.beginPath(); c.roundRect(X1 - 16 - tw, y - 19, tw, 38, 10); c.fill();
      c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, X1 - 16 - tw / 2, y + 1);
      c.restore();
    });
    // the candles draw in left → right
    const n = cs.length, pitch = (pxN - px0) / n, bw = Math.max(3, pitch * 0.62);
    const ck = ease.inOutSine(prog(u, 0.15, 0.85));
    const shown = Math.floor(ck * n);
    for (let j = 0; j < shown; j++) {
      const q = cs[j]!, x = px0 + (j + 0.5) * pitch, upc = q[4]! >= q[1]!;
      c.strokeStyle = upc ? LIME : '#C9CED4'; c.fillStyle = upc ? LIME : '#C9CED4'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x, Y(q[2]!)); c.lineTo(x, Y(q[3]!)); c.stroke();
      const t1y = Y(Math.max(q[1]!, q[4]!)), b1y = Y(Math.min(q[1]!, q[4]!));
      c.fillRect(x - bw / 2, t1y, bw, Math.max(2, b1y - t1y));
    }
    if (shown < n) MOTION.fast = true;
    // the last close + the scenario path: last → entry (dotted) → pivot (the arrow) → the next level (faint)
    const leg = a.legs[0];
    const last = cs[n - 1]!, lx = px0 + (n - 0.5) * pitch, ly = Y(last[4]!);
    const pk = prog(u, 1.15, 2.3);
    if (ck >= 1) {
      c.save(); c.fillStyle = BONE; c.beginPath(); c.arc(lx, ly, 7, 0, Math.PI * 2); c.fill(); c.restore();
    }
    if (leg && pk > 0) {
      const ex = pxN + 55, tx = pxN + 150, t2x = pxN + 215;
      const pts: [number, number][] = [[lx, ly], [ex, Y(leg.entry)], [tx, Y(leg.t1)], [t2x, Y(leg.t2)]];
      const seg = (i: number) => clamp(pk * 3 - i);
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      // 1 · to the entry (dotted)
      c.strokeStyle = 'rgba(242,243,245,0.7)'; c.lineWidth = 3; c.setLineDash([2, 10]);
      c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); c.lineTo(lerp(pts[0]![0], pts[1]![0], seg(0)), lerp(pts[0]![1], pts[1]![1], seg(0))); c.stroke(); c.setLineDash([]);
      // 2 · entry → the pivot: the scenario (lime, with a glow and a head)
      if (seg(1) > 0) {
        const hx = lerp(pts[1]![0], pts[2]![0], seg(1)), hy = lerp(pts[1]![1], pts[2]![1], seg(1));
        c.save(); c.filter = 'blur(10px)'; c.strokeStyle = LIME; c.globalAlpha *= 0.7; c.lineWidth = 12; c.beginPath(); c.moveTo(pts[1]![0], pts[1]![1]); c.lineTo(hx, hy); c.stroke(); c.restore();
        c.strokeStyle = LIME; c.lineWidth = 6; c.beginPath(); c.moveTo(pts[1]![0], pts[1]![1]); c.lineTo(hx, hy); c.stroke();
        const ang = Math.atan2(pts[2]![1] - pts[1]![1], pts[2]![0] - pts[1]![0]);
        c.save(); c.translate(hx, hy); c.rotate(ang); c.fillStyle = LIME; c.beginPath(); c.moveTo(14, 0); c.lineTo(-14, -12); c.lineTo(-14, 12); c.closePath(); c.fill(); c.restore();
        c.fillStyle = BONE; c.beginPath(); c.arc(pts[1]![0], pts[1]![1], 9, 0, Math.PI * 2); c.fill();
        c.strokeStyle = LIME; c.lineWidth = 4; c.stroke();
      }
      // 3 · on to the next level (faint, dashed)
      if (seg(2) > 0) {
        c.strokeStyle = 'rgba(146,199,32,0.45)'; c.lineWidth = 3; c.setLineDash([10, 10]);
        c.beginPath(); c.moveTo(pts[2]![0], pts[2]![1]); c.lineTo(lerp(pts[2]![0], pts[3]![0], seg(2)), lerp(pts[2]![1], pts[3]![1], seg(2))); c.stroke(); c.setLineDash([]);
      }
      // the label on the entry
      const lab = leg.side === 'SELL' ? 'منطقة بيع' : 'منطقة شراء';
      c.globalAlpha *= ease.outCubic(prog(u, 1.5, 1.8));
      c.font = font('CairoV@700', 26); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = LIME;
      c.fillText(lab, pts[1]![0], pts[1]![1] + (leg.side === 'SELL' ? -34 : 36));
      c.restore();
      if (pk < 1) MOTION.fast = true;
    }
    // the three numbers (reading order: R1 on the right, P, S1)
    const boxes: [string, number, string][] = [['المقاومة الأولى', P.r1!, RES], ['الارتكاز', P.pp!, PIV], ['الدعم الأول', P.s1!, SUP]];
    const bwid = 300, gap = 20, bx0 = W / 2 + (bwid * 3 + gap * 2) / 2;
    boxes.forEach(([lab, v, col], i) => {
      const k = ease.outBack(prog(u, 0.9 + i * 0.1, 1.25 + i * 0.1)); if (k <= 0) return;
      const x = bx0 - (i + 1) * bwid - i * gap, y = 1215;
      c.save(); c.globalAlpha *= clamp(k); c.translate(x + bwid / 2, y + 70); c.scale(lerp(0.9, 1, k), lerp(0.9, 1, k)); c.translate(-bwid / 2, -70);
      c.fillStyle = PANEL; c.strokeStyle = EDGE; c.lineWidth = 2; c.beginPath(); c.roundRect(0, 0, bwid, 140, 22); c.fill(); c.stroke();
      c.fillStyle = col; c.fillRect(0, 22, 6, 96);
      c.font = font('CairoV@600', 28); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = MUTED; c.fillText(lab, bwid / 2, 42);
      c.font = font('Artegra-700', 40); c.direction = 'ltr'; c.fillStyle = col; c.fillText(fmt(v, d), bwid / 2, 96);
      c.restore();
    });
    c.restore();
    // the line said
    c.save(); c.globalAlpha = 1 - out;
    drawLine(c, line, t, 1530, { size: 44, accent: (w) => /هابط|صاعد|المقاومة|الارتكاز|الدعم/.test(w) });
    c.restore();
    return { glowK: 0.25 * inK * (1 - out), glowP: [W / 2, 780] };
  }

  // ================================================================ the end
  end(c: CanvasRenderingContext2D, t: number, t0: number) {
    const k = ease.outCubic(prog(t, t0, t0 + 0.6));
    const lw = 620, L = this.logo, lh = lw * (L.H / L.W);
    c.save(); c.translate(W / 2 - lw / 2, 640 - lh / 2 + (1 - k) * 24);
    drawLockup(c, L, lw, { vk: [ease.outCubic(prog(t, t0, t0 + 0.35)), ease.outCubic(prog(t, t0 + 0.12, t0 + 0.47))], lk: [0, 1, 2, 3, 4].map((i) => prog(t, t0 + 0.2 + i * 0.07, t0 + 0.55 + i * 0.07)), vCol: LIME, lCol: BONE });
    c.restore();
    c.save(); c.globalAlpha = ease.outCubic(prog(t, t0 + 0.5, t0 + 0.9)) * 0.85; c.font = font('Artegra-600', 34); c.direction = 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = LIME;
    c.fillText('vexoda.com', W / 2, 640 + lh / 2 + 70); c.restore();
    drawLine(c, this.L[5]!, t, 1080, { size: 46, accent: (w) => /VEXODA/.test(w) });
    c.save(); c.globalAlpha = ease.outCubic(prog(t, t0 + 1.0, t0 + 1.5)) * 0.5; c.font = font('CairoV@500', 30); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = BONE;
    c.fillText(RISK, W / 2, H - 300); c.restore();
    return { glowK: 0.45 * k, glowP: [W / 2, 640] };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const U = this.ui; U.clear();
    const c = U.ctx, C = this.C;
    let o: { glowK?: number; glowP?: number[] };
    if (t < C[1]!) o = this.hook(c, t, C[1]!);
    else if (t < C[5]!) { const li = t < C[2]! ? 1 : t < C[3]! ? 2 : t < C[4]! ? 3 : 4; o = this.market(c, t, C[li]!, C[li + 1]!, li); }
    else o = this.end(c, t, C[5]!);
    const bu = this.bg.u;
    bu.t!.value = t; bu.glowK!.value = o.glowK ?? 0; bu.glowP!.value = o.glowP ?? [W / 2, H / 2];
    this.bg.render(renderer, out);
    comp.draw(renderer, U.upload(), out);
    const cut = [C[1]!, C[2]!, C[3]!, C[4]!, C[5]!].reduce((m, s) => Math.max(m, pulse(t, s, 0.08)), 0);
    const end = prog(t, this.ctx.end - 1.0, this.ctx.end - 0.05, ease.inQuad);
    return { bloom: 0.22, bloomThreshold: 0.85, bloomRadius: 0.6, halation: 0, ca: 0.2 + 0.9 * cut, grain: 0.03, vignette: 0.25, zoom: 1 + 0.01 * cut, zblur: 0.3 * cut, fade: end };
  }
}
