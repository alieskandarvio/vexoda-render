// GOLDWHY — «لماذا يتحرّك الذهب؟»: an explainer reel on the voiceover (after the «crypto looks random… every move has
// a cause» motion piece: light grey field, black type that darkens word by word as it is said, black organic blobs at
// the edges, a sticky note with a hand-drawn chart, dashed selection boxes and a cursor, a phone, a dotted chain).
// The screen IS the transcript: every word lands when it is said (data/lyrics.json, Gemini TTS «Charon»).
//   SH0 lines 0–1  «الذهب يبدو عشوائيًا.» in a selection box + cursor · the sticky note: up, then the crash (red pen)
//   SH1 line 2     «لكنّ لكلّ حركةٍ سببًا.» — the gold bar, a black band sweeping behind it
//   SH2 line 3     «البداية بسيطة: العرض والطلب.» — two dashed boxes, the cursor selects each
//   SH3 line 4     the Fed: a phone with the gold chart; on «بقوّة» the candle jumps
//   SH4 line 5     the dollar up, gold down (two columns)
//   SH5 line 6     the crowd (silhouettes, a warm glow), «حروب / تضخّم» set vertically, coins roll in on «الذهب»
//   SH6 lines 7–8  the chain: a dotted path, 01 / 02 / 03
//   SH7 line 9     the phone again: VEXODA's daily gold analysis (the real levels for Mon 16/11)
//   SH8 line 10+   the question, «اكتبه في التعليقات», the lockup
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';
import type { Line, Word } from '../engine/lyrics';

const INK = '#141414', GREY = '#A9A9A9', PAPER = '#EFEFED', LIME = '#92C720', LIME_D = '#6F9A12', RED = '#E5484D', NOTE = '#F7E36C';
const RISK = 'التداول ينطوي على مخاطر عالية، وقد تخسر رأس مالك.';

const FIELD = /* glsl */ `
uniform float t; uniform vec3 glow;
void main() {
  vec2 p = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec3 c = vec3(0.8632, 0.8632, 0.8550);                    // #EFEFED (linear)
  float v = length((p - vec2(${W / 2}.0, ${H / 2}.0)) / vec2(${W}.0, ${H}.0));
  c *= 1.0 - 0.06 * smoothstep(0.3, 0.8, v);
  vec2 g = (p - glow.xy) / vec2(460.0, 360.0);
  c = mix(c, vec3(0.95, 0.42, 0.10), glow.z * exp(-dot(g, g)));   // a warm, sunset glow behind the crowd
  fragColor = vec4(c, 1.0);
}`;

const h01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Words of a line laid right-to-left in wrapped rows; each word arrives grey on its time and darkens to ink. */
function words(c: CanvasRenderingContext2D, line: Line, t: number, cx: number, cy: number, o: { size?: number; wt?: number; maxW?: number; big?: (w: string) => number; accent?: (w: string) => string | null; lh?: number; alpha?: number } = {}) {
  const size = o.size ?? 64, sp = size * 0.28, maxW = o.maxW ?? W - 150;
  const ws = line.words.map((w) => {
    const latin = /[A-Za-z]/.test(w.w), k = o.big?.(w.w) ?? 1, sz = size * k * (latin ? 0.78 : 1);
    c.font = font(latin ? 'Artegra-800' : `CairoV@${o.wt ?? 800}`, sz); c.direction = latin ? 'ltr' : 'rtl';
    return { w, latin, sz, wd: c.measureText(w.w).width };
  });
  const rows: (typeof ws)[] = []; let cur: typeof ws = [], cw = 0;
  for (const x of ws) { if (cur.length && cw + sp + x.wd > maxW) { rows.push(cur); cur = []; cw = 0; } cw += (cur.length ? sp : 0) + x.wd; cur.push(x); }
  if (cur.length) rows.push(cur);
  const rh = rows.map((r) => Math.max(...r.map((x) => x.sz)) * (o.lh ?? 1.25));
  let y = cy - rh.reduce((a, b) => a + b, 0) / 2;
  rows.forEach((r, ri) => {
    y += rh[ri]! / 2;
    const tot = r.reduce((a, x) => a + x.wd, 0) + sp * (r.length - 1);
    let x = cx + tot / 2;
    for (const it of r) {
      x -= it.wd;
      const k = prog(t, it.w.start - 0.06, it.w.start + 0.14), dk = prog(t, it.w.start + 0.05, it.w.start + 0.4);
      if (k > 0) {
        const e = ease.outCubic(k);
        c.save(); c.globalAlpha *= e * (o.alpha ?? 1);
        c.font = font(it.latin ? 'Artegra-800' : `CairoV@${o.wt ?? 800}`, it.sz); c.direction = it.latin ? 'ltr' : 'rtl'; c.textAlign = 'left'; c.textBaseline = 'middle';
        if (k < 1) { c.filter = `blur(${(1 - e) * 8}px)`; MOTION.fast = true; }
        const acc = o.accent?.(it.w.w);
        c.fillStyle = acc ?? mixHex(GREY, INK, ease.inOutSine(dk));
        c.fillText(it.w.w, x, y + (1 - e) * 12);
        c.restore();
      }
      x -= sp;
    }
    y += rh[ri]! / 2;
  });
}
function mixHex(a: string, b: string, k: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i]!, clamp(k)))).join(',')})`;
}
/** An organic black blob (the reference's edge shapes): a closed noisy loop, slowly breathing. */
function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, t: number, seed: number, k = 1) {
  if (k <= 0) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k); c.fillStyle = INK; c.beginPath();
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (1 + 0.28 * Math.sin(a * 2 + seed) + 0.14 * Math.sin(a * 3 + t * 0.6 + seed * 2) + 0.07 * Math.sin(a * 5 - t * 0.4));
    const px = Math.cos(a) * rr * 1.35, py = Math.sin(a) * rr * 0.72;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fill(); c.restore();
}
/** A dashed selection box with corner handles (a design tool's). */
function selBox(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, k: number) {
  if (k <= 0) return;
  c.save(); c.globalAlpha *= clamp(k * 2); c.strokeStyle = INK; c.lineWidth = 2.5; c.setLineDash([9, 7]);
  const per = 2 * ((x1 - x0) + (y1 - y0)); c.lineDashOffset = 0;
  c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0);
  c.save(); c.beginPath(); c.rect(x0 - 20, y0 - 20, (x1 - x0 + 40) * clamp(k * 1.4), y1 - y0 + 40); c.clip();
  c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.stroke(); c.restore();
  c.setLineDash([]); c.fillStyle = PAPER; c.lineWidth = 2.5;
  for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) { c.beginPath(); c.rect(hx - 7, hy - 7, 14, 14); c.fill(); c.stroke(); }
  void per; c.restore();
}
function cursor(c: CanvasRenderingContext2D, x: number, y: number, press = 0, a = 1) {
  if (a <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(1.9 * (1 - 0.12 * press), 1.9 * (1 - 0.12 * press));
  c.fillStyle = INK; c.strokeStyle = PAPER; c.lineWidth = 1.6; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22); c.lineTo(6, 16.5); c.lineTo(10.5, 26); c.lineTo(14, 24.5); c.lineTo(9.6, 15.4); c.lineTo(17, 15.4); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
function phone(c: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  c.save(); c.translate(cx - w / 2, cy - h / 2);
  c.save(); c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 50; c.shadowOffsetY = 24; c.fillStyle = '#0A0A0B'; c.beginPath(); c.roundRect(0, 0, w, h, 70); c.fill(); c.restore();
  c.fillStyle = '#0F1216'; c.beginPath(); c.roundRect(14, 14, w - 28, h - 28, 58); c.fill();
  c.save(); c.beginPath(); c.roundRect(14, 14, w - 28, h - 28, 58); c.clip(); c.translate(14, 14); draw(c, w - 28, h - 28); c.restore();
  c.fillStyle = '#0A0A0B'; c.beginPath(); c.roundRect(w / 2 - 70, 30, 140, 38, 19); c.fill();
  c.restore();
}

type Gold = { pivots: Record<string, number>; bias: string; price: number; candles: number[][] };

export default class GoldWhy extends Scene {
  bg = new FSPass(FIELD, { t: { value: 0 }, glow: { value: [0, 0, 0] } });
  ui = new Layer2D();
  logo!: Logo; bar!: HTMLImageElement; coin!: HTMLImageElement; G!: Gold;
  L: Line[] = []; C: number[] = [];

  override async init() {
    this.logo = await loadLogo();
    const img = async (s: string) => { const m = new Image(); m.src = s; await m.decode(); return m; };
    this.bar = await img('img/bar.png'); this.coin = await img('img/coin.png');
    this.G = await (await fetch('gold.json')).json();
    this.L = this.ctx.lyrics.lines;
    this.C = this.L.map((l, i) => { const p = this.L[i - 1]; const gap = p ? l.start - p.end : 1; return Math.max(0, l.start - Math.min(0.2, Math.max(0.06, gap * 0.45))); });
  }
  W(li: number, q: string): Word { const l = this.L[li]!; return l.words.find((w) => w.w.includes(q)) ?? l.words[0]!; }

  // ---------------------------------------------------------------- SH0 · random? then the crash
  sh0(c: CanvasRenderingContext2D, t: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic);
    blob(c, -40, 360, 230, -0.5, t, 1, ease.outBack(prog(t, 0.0, 0.5)));
    blob(c, W + 30, 1640, 260, 0.6, t, 4, ease.outBack(prog(t, 0.15, 0.65)));
    c.save(); c.globalAlpha = 1 - out;
    const l0 = this.L[0]!, ty = 520;
    words(c, l0, t, W / 2, ty, { size: 86 });
    // the selection box draws around the line, the cursor comes in and clicks
    const sk = ease.outCubic(prog(t, l0.end - 0.2, l0.end + 0.25));
    selBox(c, 120, ty - 90, W - 120, ty + 90, sk);
    const ck = ease.inOutCubic(prog(t, l0.end - 0.3, l0.end + 0.3));
    cursor(c, lerp(W * 0.9, W - 150, ck), lerp(H * 0.6, ty + 70, ck), pulse(t, l0.end + 0.35, 0.12), prog(t, l0.end - 0.4, l0.end - 0.2));
    // the sticky note: the price climbs… and crashes in red pen
    const l1 = this.L[1]!, nk = ease.outBack(prog(t, l1.start - 0.25, l1.start + 0.15));
    if (nk > 0) {
      c.save(); c.translate(W / 2, 1120); c.rotate(-0.06); c.scale(nk, nk);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 30; c.shadowOffsetY = 16; c.fillStyle = NOTE; c.fillRect(-300, -280, 600, 560); c.restore();
      c.strokeStyle = 'rgba(20,20,20,0.12)'; c.lineWidth = 1.5;
      for (let i = -220; i <= 220; i += 55) { c.beginPath(); c.moveTo(-250, i); c.lineTo(250, i); c.stroke(); }
      const up = this.W(1, 'يصعد'), dn = this.W(1, 'ينهار');
      const pk = prog(t, up.start - 0.05, dn.start - 0.05), ck2 = prog(t, dn.start - 0.05, dn.start + 0.45);
      const pts: [number, number][] = []; const N = 60;
      for (let i = 0; i <= N; i++) { const u = i / N; pts.push([-240 + u * 380, 150 - u * 330 + 45 * Math.sin(u * 19) + 22 * Math.sin(u * 47)]); }
      c.strokeStyle = '#2A2A2A'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); pts.slice(0, Math.max(2, Math.round(pk * N))).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
      if (ck2 > 0) {
        const [x0, y0] = pts[N]!, x1 = x0 + 90 * ck2, y1 = y0 + 520 * ease.inCubic(ck2);
        c.strokeStyle = RED; c.lineWidth = 7; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 70, y0 + 120, x1, y1); c.stroke();
        if (ck2 > 0.6) { c.fillStyle = RED; c.save(); c.translate(x1, y1); c.rotate(0.15); c.beginPath(); c.moveTo(0, 30); c.lineTo(-20, -6); c.lineTo(20, -6); c.closePath(); c.fill(); c.restore(); }
        if (ck2 < 1) MOTION.fast = true;
      }
      c.restore();
    }
    words(c, l1, t, W / 2, 1560, { size: 78, accent: (w) => (w.includes('ينهار') ? RED : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH1 · every move has a cause
  sh1(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const u = t - t0, out = prog(t, t1 - 0.16, t1, ease.inCubic);
    // the black band sweeps behind the bar
    const bk = ease.inOutCubic(prog(u, 0, 0.6));
    c.save(); c.globalAlpha = 1 - out; c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = 210;
    c.beginPath(); c.moveTo(-200, 1500); c.bezierCurveTo(300, 1250, 700, 1450, lerp(-200, W + 300, bk), lerp(1500, 980, bk)); c.stroke(); c.restore();
    const ek = ease.outBack(prog(u, 0.05, 0.55));
    c.save(); c.globalAlpha = (1 - out) * clamp(ek * 1.5); c.translate(W / 2, 1180 + Math.sin(t * 2.2) * 10); c.rotate(-0.08 + 0.05 * Math.sin(t * 1.3)); c.scale(0.9 * ek, 0.9 * ek);
    c.drawImage(this.bar, -512, -512, 1024, 1024);
    c.restore();
    c.save(); c.globalAlpha = 1 - out;
    words(c, this.L[2]!, t, W / 2, 560, { size: 72, big: (w) => (w.includes('سبب') ? 2.1 : 1) });
    c.restore();
    MOTION.fast = true;
    return {};
  }

  // ---------------------------------------------------------------- SH2 · supply and demand
  sh2(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic), l = this.L[3]!;
    blob(c, W + 60, 260, 210, 0.4, t, 7, ease.outBack(prog(t, t0, t0 + 0.5)));
    blob(c, -60, 1700, 240, -0.3, t, 9, ease.outBack(prog(t, t0 + 0.1, t0 + 0.6)));
    c.save(); c.globalAlpha = 1 - out;
    const head = { ...l, words: l.words.slice(0, 2) } as Line;
    words(c, head, t, W / 2, 620, { size: 66, wt: 700 });
    const boxes: [string, number][] = [['العرض', 900], ['الطلب', 1180]];
    boxes.forEach(([lab, y], i) => {
      const w = this.W(3, lab), k = ease.outCubic(prog(t, w.start - 0.1, w.start + 0.25));
      if (k <= 0) return;
      c.save(); c.globalAlpha *= k; c.font = font('CairoV@800', 96); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(lab).width; c.fillStyle = INK; c.fillText(lab, W / 2, y + (1 - k) * 16); c.restore();
      selBox(c, W / 2 - tw / 2 - 40, y - 78, W / 2 + tw / 2 + 40, y + 78, prog(t, w.start, w.start + 0.35));
      void i;
    });
    // the cursor visits each box
    const a = this.W(3, 'العرض'), b = this.W(3, 'الطلب');
    const k1 = ease.inOutCubic(prog(t, a.start - 0.3, a.start + 0.2)), k2 = ease.inOutCubic(prog(t, b.start - 0.3, b.start + 0.2));
    const px = lerp(lerp(W * 0.85, W / 2 + 170, k1), W / 2 + 160, k2), py = lerp(lerp(H * 0.75, 940, k1), 1220, k2);
    cursor(c, px, py, Math.max(pulse(t, a.start + 0.25, 0.12), pulse(t, b.start + 0.25, 0.12)), prog(t, a.start - 0.45, a.start - 0.25));
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH3 · one decision from the Fed
  sh3(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic), l = this.L[4]!;
    const hit = this.W(4, 'بقو').start, shake = pulse(t, hit + 0.05, 0.25) * 10 * Math.sin(t * 90);
    c.save(); c.globalAlpha = 1 - out;
    words(c, l, t, W / 2, 380, { size: 66, maxW: W - 160, accent: (w) => (w.includes('الفيدرالي') ? LIME_D : null) });
    const enter = ease.outCubic(prog(t, t0, t0 + 0.4));
    c.save(); c.translate(shake, (1 - enter) * 300); c.globalAlpha *= enter;
    const C = this.G.candles, n = C.length;
    phone(c, W / 2, 1180, 560, 1040, (cc, w, h) => {
      cc.font = font('Artegra-700', 30); cc.fillStyle = '#E9ECEF'; cc.textAlign = 'left'; cc.textBaseline = 'middle'; cc.direction = 'ltr'; cc.fillText('XAU/USD', 40, 130);
      cc.font = font('Artegra-700', 54); cc.fillText('3,878.47', 40, 195);
      const lo = Math.min(...C.map((k) => k[2]!)) - 60, hi = Math.max(...C.map((k) => k[1]!)) + 160;
      const Y = (v: number) => lerp(h - 140, 290, (v - lo) / (hi - lo));
      const jump = ease.outCubic(prog(t, hit - 0.05, hit + 0.35));
      const pitch = (w - 60) / (n + 1);
      C.forEach((k, i) => {
        const x = 30 + (i + 0.5) * pitch, up = k[3]! >= k[0]!; cc.strokeStyle = up ? LIME : '#8B93A0'; cc.fillStyle = cc.strokeStyle; cc.lineWidth = 2;
        cc.beginPath(); cc.moveTo(x, Y(k[1]!)); cc.lineTo(x, Y(k[2]!)); cc.stroke();
        const a = Y(Math.max(k[0]!, k[3]!)), b = Y(Math.min(k[0]!, k[3]!)); cc.fillRect(x - pitch * 0.32, a, pitch * 0.64, Math.max(2, b - a));
      });
      if (jump > 0) {   // the decision's candle
        const x = 30 + (n + 0.5) * pitch, o = C[n - 1]![3]!, cl = o + 220 * jump;
        cc.fillStyle = LIME; cc.fillRect(x - pitch * 0.32, Y(cl), pitch * 0.64, Y(o) - Y(cl));
        cc.strokeStyle = LIME; cc.lineWidth = 2; cc.beginPath(); cc.moveTo(x, Y(cl + 25)); cc.lineTo(x, Y(o - 10)); cc.stroke();
        if (jump < 1) MOTION.fast = true;
      }
    });
    c.restore(); c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH4 · the dollar up, gold down
  sh4(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic), l = this.L[5]!;
    blob(c, -70, 1760, 220, -0.6, t, 12, ease.outBack(prog(t, t0, t0 + 0.5)));
    c.save(); c.globalAlpha = 1 - out;
    words(c, l, t, W / 2, 420, { size: 70, maxW: W - 180 });
    const s = this.W(5, 'يقوى').start, g = this.W(5, 'يضعف').start;
    const ku = ease.outBack(prog(t, s - 0.1, s + 0.5)), kd = ease.inOutCubic(prog(t, g - 0.1, g + 0.6));
    const base = 1500;
    // the dollar column (right, read first)
    const hU = lerp(260, 640, ku), xU = W / 2 + 190;
    c.fillStyle = INK; c.beginPath(); c.roundRect(xU - 110, base - hU, 220, hU, 24); c.fill();
    c.font = font('Artegra-800', 110); c.fillStyle = PAPER; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillText('$', xU, base - hU + 110);
    c.font = font('CairoV@800', 52); c.direction = 'rtl'; c.fillStyle = INK; c.fillText('الدولار', xU, base + 70);
    c.save(); c.globalAlpha *= clamp(ku * 2); c.strokeStyle = LIME_D; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(xU, base - hU - 60); c.lineTo(xU, base - hU - 150); c.moveTo(xU - 35, base - hU - 115); c.lineTo(xU, base - hU - 150); c.lineTo(xU + 35, base - hU - 115); c.stroke(); c.restore();
    // the gold column (left) sinks
    const hG = lerp(560, 230, kd), xG = W / 2 - 190;
    c.fillStyle = '#D9B54A'; c.beginPath(); c.roundRect(xG - 110, base - hG, 220, hG, 24); c.fill();
    c.drawImage(this.coin, xG - 85, base - hG - 85 - 20, 170, 170);
    c.font = font('CairoV@800', 52); c.fillStyle = INK; c.fillText('الذهب', xG, base + 70);
    c.save(); c.globalAlpha *= clamp(kd * 2); c.strokeStyle = RED; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(xG + 150, base - hG + 30); c.lineTo(xG + 150, base - hG + 130); c.moveTo(xG + 115, base - hG + 95); c.lineTo(xG + 150, base - hG + 130); c.lineTo(xG + 185, base - hG + 95); c.stroke(); c.restore();
    c.strokeStyle = 'rgba(20,20,20,0.25)'; c.lineWidth = 3; c.beginPath(); c.moveTo(150, base + 2); c.lineTo(W - 150, base + 2); c.stroke();
    if (ku < 1 || kd < 1) MOTION.fast = true;
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH5 · when the world shakes
  sh5(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic), l = this.L[6]!;
    const gk = ease.inOutSine(prog(t, this.W(6, 'يركض').start - 0.2, this.W(6, 'الذهب').start + 0.3));
    c.save(); c.globalAlpha = 1 - out;
    // the crowd: three silhouettes, softly blurred like a photograph
    c.save(); c.filter = 'blur(6px)';
    [[W / 2 - 300, 1490, 0.85, 0.55], [W / 2 + 280, 1520, 0.9, 0.62], [W / 2, 1430, 1.15, 0.85]].forEach(([x, y, s, a]) => {
      c.save(); c.translate(x!, y!); c.scale(s!, s!); c.fillStyle = `rgba(20,20,20,${a})`;
      c.beginPath(); c.ellipse(0, -330, 95, 118, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-260, 140); c.bezierCurveTo(-250, -120, -120, -190, 0, -195); c.bezierCurveTo(120, -190, 250, -120, 260, 140); c.closePath(); c.fill(); c.restore();
    });
    c.restore();
    // «حروب» and «تضخّم» set vertically at the sides
    [['حروب', 120, -1, this.W(6, 'حروب')], ['وتضخّم،', W - 120, 1, this.W(6, 'تضخ')]].forEach(([s, x, dir, w]) => {
      const ww = w as Word, k = ease.outCubic(prog(t, ww.start - 0.08, ww.start + 0.25)); if (k <= 0) return;
      c.save(); c.globalAlpha *= k; c.translate(x as number, 980); c.rotate((dir as number) * Math.PI / 2);
      c.font = font('CairoV@800', 120); c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK; c.fillText((s as string).replace(/[،]/g, ''), 0, 0); c.restore();
    });
    words(c, l, t, W / 2, 400, { size: 64, maxW: W - 300, accent: (w) => (w.includes('الذهب') ? '#B8902A' : null) });
    // coins roll in along the floor on «نحو الذهب»
    const rk = ease.outCubic(prog(t, this.W(6, 'نحو').start, this.W(6, 'نحو').start + 0.9));
    for (let i = 0; i < 5; i++) {
      const x = lerp(-300 - i * 220, 170 + i * 185, rk), sz = 170;
      c.save(); c.translate(x, 1745); c.rotate(rk * 6 + i); c.drawImage(this.coin, -sz / 2, -sz / 2, sz, sz); c.restore();
    }
    if (rk > 0 && rk < 1) MOTION.fast = true;
    c.restore();
    return { glow: [W / 2, 1250, 0.75 * gk * (1 - out)] };
  }

  // ---------------------------------------------------------------- SH6 · the chain
  sh6(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic);
    blob(c, W + 40, 1720, 240, 0.8, t, 15, ease.outBack(prog(t, t0, t0 + 0.5)));
    c.save(); c.globalAlpha = 1 - out;
    words(c, this.L[7]!, t, W / 2, 330, { size: 60, wt: 700 });
    const l8 = this.L[8]!;
    const nodes: [string, string, number, number, number][] = [['01', 'الدولار والفائدة', 760, 640, 0], ['02', 'الخوف والأزمات', 360, 1020, 2], ['03', 'والطلب', 720, 1400, 4]];
    // the dotted path, drawn in as each cause is said
    const path = (u: number) => { const p0 = [880, 470], p = [[760, 640], [360, 1020], [720, 1400], [560, 1640]];
      const seg = Math.min(3, Math.floor(u * 4)), f = u * 4 - seg; const a = seg === 0 ? p0 : p[seg - 1]!, b = p[seg]!;
      return [lerp(a[0]!, b[0]!, f) + Math.sin(f * Math.PI) * 120 * (seg % 2 ? -1 : 1), lerp(a[1]!, b[1]!, f)]; };
    const reach = (i: number) => { const w = l8.words[nodes[i]![4]]!; return prog(t, w.start - 0.5, w.start); };
    const total = clamp(Math.max(prog(t, this.L[7]!.start, this.L[7]!.end) * 0.25, reach(0) * 0.25 + reach(1) * 0.25 + reach(2) * 0.25 + prog(t, l8.end - 0.2, l8.end + 0.4) * 0.25));
    c.save(); c.strokeStyle = INK; c.lineWidth = 4; c.setLineDash([4, 12]); c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i <= 120 * total; i++) { const [x, y] = path(i / 120); i ? c.lineTo(x!, y!) : c.moveTo(x!, y!); } c.stroke(); c.restore();
    c.fillStyle = INK; c.beginPath(); c.arc(880, 470, 12, 0, Math.PI * 2); c.fill();
    nodes.forEach(([num, lab, x, y, wi], i) => {
      const w = l8.words[wi]!, k = ease.outBack(prog(t, w.start - 0.05, w.start + 0.3)); if (k <= 0) return;
      c.save(); c.translate(x, y); c.scale(k, k);
      c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = LIME_D; c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill();
      const right = x < W / 2;
      c.font = font('CairoV@800', 64); c.direction = 'rtl'; const lw = c.measureText(lab.replace(/^و/, '')).width;
      c.fillStyle = PAPER; c.beginPath(); c.roundRect(right ? 36 : -lw - 64, -34, lw + 28, 172, 18); c.fill();
      c.font = font('Artegra-800', 46); c.fillStyle = INK; c.textBaseline = 'middle'; c.direction = 'ltr';
      c.textAlign = right ? 'left' : 'right'; c.fillText(num, right ? 50 : -50, 2);
      c.font = font('CairoV@800', 64); c.direction = 'rtl'; c.textAlign = right ? 'left' : 'right';
      c.fillText(lab.replace(/^و/, ''), right ? 50 : -50, 92);
      c.restore(); void i;
    });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH7 · we read the chain every morning
  sh7(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const out = prog(t, t1 - 0.16, t1, ease.inCubic), G = this.G, P = G.pivots;
    c.save(); c.globalAlpha = 1 - out;
    words(c, this.L[9]!, t, W / 2, 380, { size: 64, maxW: W - 200, accent: (w) => (/VEXODA/.test(w) ? LIME_D : null) });
    const enter = ease.outCubic(prog(t, t0 + 0.1, t0 + 0.55));
    c.save(); c.globalAlpha *= enter; c.translate(0, (1 - enter) * 260);
    phone(c, W / 2, 1230, 560, 1040, (cc, w, h) => {
      cc.direction = 'rtl'; cc.textAlign = 'right'; cc.textBaseline = 'middle'; cc.fillStyle = '#E9ECEF'; cc.font = font('CairoV@800', 40); cc.fillText('تحليل اليوم · الذهب', w - 36, 125);
      cc.fillStyle = '#F0715A'; cc.beginPath(); cc.roundRect(w - 36 - 130, 162, 130, 48, 24); cc.fill(); cc.fillStyle = '#0F1216'; cc.font = font('CairoV@800', 28); cc.textAlign = 'center'; cc.fillText('هابط ▼', w - 36 - 65, 187);
      const C = G.candles, n = C.length, lo = P.s2! - 15, hi = Math.max(...C.slice(-24).map((k) => k[1]!), P.r2!) + 10;
      const sub = C.slice(-24), pitch = (w - 170) / sub.length, Y = (v: number) => lerp(h - 200, 230, (v - lo) / (hi - lo));
      const lk = (i: number) => ease.outCubic(prog(t, t0 + 0.6 + i * 0.12, t0 + 1.0 + i * 0.12));
      ([['R1', P.r1!, '#F0715A'], ['P', P.pp!, '#E8B83A'], ['S1', P.s1!, '#2DBFA8']] as [string, number, string][]).forEach(([tg, v, col], i) => {
        const k = lk(i); if (k <= 0) return; cc.save(); cc.globalAlpha *= k; cc.strokeStyle = col; cc.lineWidth = 2.5; cc.setLineDash(tg === 'P' ? [] : [10, 8]);
        cc.beginPath(); cc.moveTo(20, Y(v)); cc.lineTo(lerp(20, w - 150, k), Y(v)); cc.stroke(); cc.setLineDash([]);
        cc.fillStyle = col; cc.beginPath(); cc.roundRect(w - 146, Y(v) - 18, 130, 36, 9); cc.fill(); cc.fillStyle = '#0F1216'; cc.font = font('Artegra-700', 20); cc.textAlign = 'center'; cc.direction = 'ltr'; cc.fillText(`${tg} ${v.toFixed(2)}`, w - 81, Y(v) + 1); cc.restore();
      });
      sub.forEach((k, i) => {
        const x = 30 + (i + 0.5) * pitch, up = k[3]! >= k[0]!; cc.strokeStyle = up ? LIME : '#8B93A0'; cc.fillStyle = cc.strokeStyle; cc.lineWidth = 2;
        cc.beginPath(); cc.moveTo(x, Y(k[1]!)); cc.lineTo(x, Y(k[2]!)); cc.stroke();
        const a = Y(Math.max(k[0]!, k[3]!)), b = Y(Math.min(k[0]!, k[3]!)); cc.fillRect(x - pitch * 0.3, a, pitch * 0.6, Math.max(2, b - a));
      });
      void n;
      cc.direction = 'rtl'; cc.textAlign = 'center'; cc.font = font('CairoV@600', 24); cc.fillStyle = 'rgba(233,236,239,0.55)'; cc.fillText('مثال من تحليل VEXODA اليومي', w / 2, h - 90);
    });
    c.restore(); c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH8 · the question, the lockup
  sh8(c: CanvasRenderingContext2D, t: number, t0: number) {
    const l = this.L[10]!, endT = l.end + 0.35;
    const qOut = prog(t, endT, endT + 0.35, ease.inCubic);
    blob(c, -60, 260, 230, -0.4, t, 21, ease.outBack(prog(t, t0, t0 + 0.5)));
    blob(c, W + 80, 1830, 250, 0.5, t, 23, ease.outBack(prog(t, t0 + 0.1, t0 + 0.6)));
    c.save(); c.globalAlpha = 1 - qOut;
    const split = l.words.findIndex((w) => w.w.includes('اكتب'));
    words(c, { ...l, words: l.words.slice(0, split) } as Line, t, W / 2, 820, { size: 84, maxW: W - 200, accent: (w) => (w.includes('الذهب') ? '#B8902A' : null) });
    const tail = { ...l, words: l.words.slice(split) } as Line;
    const bk = ease.outBack(prog(t, tail.words[0]!.start - 0.1, tail.words[0]!.start + 0.3));
    if (bk > 0) {   // a comment bubble
      c.save(); c.translate(W / 2, 1180); c.scale(bk, bk); c.fillStyle = INK; c.beginPath(); c.roundRect(-330, -80, 660, 160, 80); c.fill();
      c.beginPath(); c.moveTo(150, 70); c.lineTo(230, 140); c.lineTo(230, 60); c.closePath(); c.fill(); c.restore();
      c.save(); c.globalAlpha *= clamp(bk); words(c, tail, t, W / 2, 1180, { size: 60, accent: () => PAPER }); c.restore();
    }
    c.restore();
    const vx = endT + 0.15, k = prog(t, vx, vx + 0.9);
    if (k > 0) {
      const lw = 620, L = this.logo, lh = lw * (L.H / L.W);
      c.save(); c.translate(W / 2 - lw / 2, H / 2 - lh / 2 - 40 + (1 - ease.outCubic(prog(t, vx, vx + 0.5))) * 24);
      drawLockup(c, L, lw, { vk: [ease.outCubic(prog(t, vx, vx + 0.35)), ease.outCubic(prog(t, vx + 0.12, vx + 0.47))], lk: [0, 1, 2, 3, 4].map((i) => prog(t, vx + 0.2 + i * 0.07, vx + 0.55 + i * 0.07)), vCol: LIME, lCol: INK });
      c.restore();
      const k2 = ease.outCubic(prog(t, vx + 0.6, vx + 1.0));
      c.save(); c.globalAlpha = k2 * 0.85; c.font = font('Artegra-600', 34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillStyle = INK; c.fillText('vexoda.com', W / 2, H / 2 + lh / 2 + 60); c.restore();
      c.save(); c.globalAlpha = k2 * 0.55; c.font = font('CairoV@500', 31); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.fillStyle = INK; c.fillText(RISK, W / 2, H - 300); c.restore();
      if (k < 1) MOTION.fast = true;
    }
    return {};
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t; const U = this.ui; U.clear(); const c = U.ctx, C = this.C;
    const cuts = [C[2]!, C[3]!, C[4]!, C[5]!, C[6]!, C[7]!, C[9]!, C[10]!];
    let o: { glow?: number[] };
    if (t < cuts[0]!) o = this.sh0(c, t, cuts[0]!);
    else if (t < cuts[1]!) o = this.sh1(c, t, cuts[0]!, cuts[1]!);
    else if (t < cuts[2]!) o = this.sh2(c, t, cuts[1]!, cuts[2]!);
    else if (t < cuts[3]!) o = this.sh3(c, t, cuts[2]!, cuts[3]!);
    else if (t < cuts[4]!) o = this.sh4(c, t, cuts[3]!, cuts[4]!);
    else if (t < cuts[5]!) o = this.sh5(c, t, cuts[4]!, cuts[5]!);
    else if (t < cuts[6]!) o = this.sh6(c, t, cuts[5]!, cuts[6]!);
    else if (t < cuts[7]!) o = this.sh7(c, t, cuts[6]!, cuts[7]!);
    else o = this.sh8(c, t, cuts[7]!);
    const bu = this.bg.u; bu.t!.value = t; bu.glow!.value = o.glow ?? [0, 0, 0];
    this.bg.render(renderer, out); comp.draw(renderer, U.upload(), out);
    const cut = cuts.reduce((m, s) => Math.max(m, pulse(t, s, 0.08)), 0);
    return { flat: 1, bloom: 0, halation: 0, ca: 0.1 + 0.7 * cut, grain: 0.02, vignette: 0.06, zoom: 1 + 0.014 * cut, zblur: 0.3 * cut, fade: 0 };
  }
}
