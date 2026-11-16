// PLAN — «الأرباح تبدو مبهرة… حتى تُختبَر الخطّة» (Ali 11-16, after the «Impressive Growth» Pinterest reel: a light grey field
// with a soft vignette, black leaves in two corners, the logo at the top, word-by-word type that arrives grey and darkens,
// one black-and-white object per idea, a black end card). Female voiceover (Gemini TTS «Sulafat»); the screen IS the transcript.
// The objects are our own cover / reel renders shown in grayscale; the rest is drawn here (cloche, stairs, rope, dominoes).
//   SH0  lines 0–1   a black cloche lifts on «مبهرة» and shows «الأرباح» · «الخطّة» big, in lime
//   SH1  line 2      steps rise one per clause, the balance counts up
//   SH2  line 3      «ثم يتغيّر شيءٌ ما» — the hourglass turns over (the music drops here)
//   SH3  line 4      the phone (our app) — a red «عاجل» banner drops onto it, the phone shakes on «يهزّ»
//   SH4  line 5      a tightrope walker — the net under him dissolves on «لم يُوضَع»
//   SH5  line 6      the pawn tips over on «تنقلب», «ضدّك» in red
//   SH6  line 7      the question, type only
//   SH7  line 8      «مهارة…» the thinker · «حظًّا؟» a die rolls in
//   SH8  line 9      the suit stands still while the type presses down — «يصمد» (the music comes back)
//   SH9  line 10     a row of dominoes falls on «ينهار»
//   SH10 line 11     the knight rises, «خطّة» in lime
//   SH11 line 12+    the black end card: the lockup, «تداوَل بخطّة», vexoda.com, the risk line
// One file serves both cuts (Ali 11-16 «لا تنسى يكون في نسخة انكليزي»): LANG picks the direction, the faces, the
// labels and the word each event keys to (K).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';
import type { Line, Word } from '../engine/lyrics';

const LANG = 'en' as 'ar' | 'en';
const AR = LANG === 'ar';
const INK = '#141414', GREY = '#B4B4B0', PAPER = '#F1F1EF', LIME = '#92C720', LIME_D = '#6F9A12', RED = '#D9363E';
const RISK = AR ? 'التداول ينطوي على مخاطر عالية، وقد تخسر رأس مالك.' : 'Trading involves high risk, and you may lose your capital.';
const K = AR
  ? { wow: 'مبهرة', plan: 'الخط', s: ['الصفقات', 'تربح', 'والحساب', 'يكبر', 'والثقة', 'ترتفع'], grow: ['يكبر', 'ترتفع'], change: 'يتغي', news: 'خبر', sudden: 'مفاجئ',
      shake: 'يهز', stop: 'الخسار', set: 'يوضع', turn: 'تنقلب', you: 'ضد', question: 'السؤال', skill: 'مهارة', luck: 'حظ', holds: 'يصمد', pressure: 'الضغط',
      collapse: 'ينهار', plan2: 'خط', plan3: 'بخط' }
  : { wow: 'impressive', plan: 'plan', s: ['trades', 'win', 'account', 'grows', 'confidence', 'rises'], grow: ['grows', 'rises'], change: 'changes', news: 'news',
      sudden: 'sudden', shake: 'shakes', stop: 'stop', set: 'set', turn: 'turns', you: 'you', question: 'question', skill: 'skill', luck: 'luck', holds: 'holds',
      pressure: 'pressure', collapse: 'collapses', plan2: 'plan', plan3: 'plan' };
const T = AR ? { bal: 'رصيد الحساب', brk: 'عاجل', brk2: 'السوق يتحرّك بعنف', tagN: 2 } : { bal: 'Account balance', brk: 'BREAKING', brk2: 'Markets move sharply', tagN: 4 };
/** Is this word the key? Arabic: contains it (prefixes, suffixes); English: the bare word is it. */
const is = (w: string, q: string) => (AR ? w.includes(q) : w.toLowerCase().replace(/[^a-z']/g, '') === q);

// the field: warm light grey, the edges falling off into a soft grey vignette; black at the end card
const FIELD = /* glsl */ `
uniform float t; uniform float dark;
void main() {
  vec2 p = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec2 q = (p - vec2(${(W / 2).toFixed(1)}, ${(H * 0.46).toFixed(1)})) / vec2(${W.toFixed(1)}, ${H.toFixed(1)});
  float v = smoothstep(0.18, 0.75, length(q * vec2(1.25, 0.95)));
  vec3 c = vec3(0.880, 0.880, 0.866) * (1.0 - 0.34 * v);              // #F1F1EF (linear) into grey
  vec3 d = vec3(0.004) + vec3(0.010) * (1.0 - v);                      // the end card: near black, a breath of light in the middle
  fragColor = vec4(mix(c, d, dark), 1.0);
}`;

const norm = (w: string) => w.replace(/[ً-ْـ]/g, '');   // keys match without harakat
/** Words of a line, right to left in wrapped rows; each word arrives on its time, blurred and grey, and darkens to ink. */
function words(c: CanvasRenderingContext2D, line: Line, t: number, cx: number, cy: number, o: { size?: number; wt?: number; maxW?: number; big?: (w: string) => number; accent?: (w: string) => string | null; lh?: number; alpha?: number; ink?: string } = {}) {
  // English sets wider than Arabic: a touch smaller and a narrower measure, clear of the corner leaves
  const size = (o.size ?? 72) * (AR ? 1 : 0.9), sp = size * 0.26, maxW = Math.min(o.maxW ?? W - 170, AR ? 1e9 : W - 320);
  const ws = line.words.map((w) => {
    const latin = /[A-Za-z]/.test(w.w), k = o.big?.(norm(w.w)) ?? 1, sz = size * k * (latin ? 0.8 : 1);
    c.font = font(latin ? 'Artegra-800' : `CairoV@${k > 1.2 ? 900 : o.wt ?? 800}`, sz); c.direction = latin ? 'ltr' : 'rtl';
    return { w, latin, sz, k, wd: c.measureText(w.w).width };
  });
  const rows: (typeof ws)[] = []; let cur: typeof ws = [], cw = 0;
  for (const x of ws) { if (cur.length && cw + sp + x.wd > maxW) { rows.push(cur); cur = []; cw = 0; } cw += (cur.length ? sp : 0) + x.wd; cur.push(x); }
  if (cur.length) rows.push(cur);
  const rh = rows.map((r) => Math.max(...r.map((x) => x.sz)) * (o.lh ?? 1.22));
  let y = cy - rh.reduce((a, b) => a + b, 0) / 2;
  rows.forEach((r, ri) => {
    y += rh[ri]! / 2;
    const tot = r.reduce((a, x) => a + x.wd, 0) + sp * (r.length - 1);
    let x = AR ? cx + tot / 2 : cx - tot / 2;
    for (const it of r) {
      if (AR) x -= it.wd;
      const k = prog(t, it.w.start - 0.08, it.w.start + 0.16), dk = prog(t, it.w.start + 0.05, it.w.start + 0.45);
      if (k > 0) {
        const e = ease.outCubic(k);
        c.save(); c.globalAlpha *= e * (o.alpha ?? 1);
        c.font = font(it.latin ? 'Artegra-800' : `CairoV@${it.k > 1.2 ? 900 : o.wt ?? 800}`, it.sz); c.direction = it.latin ? 'ltr' : 'rtl'; c.textAlign = 'left'; c.textBaseline = 'middle';
        if (k < 1) { c.filter = `blur(${(1 - e) * 10}px)`; MOTION.fast = true; }
        const acc = o.accent?.(norm(it.w.w));
        c.fillStyle = acc ? mixHex(GREY, acc, ease.inOutSine(dk)) : mixHex(GREY, o.ink ?? INK, ease.inOutSine(dk));
        c.fillText(it.w.w, x, y + (1 - e) * 14);
        c.restore();
      }
      x += AR ? -sp : it.wd + sp;
    }
    y += rh[ri]! / 2;
  });
}
function mixHex(a: string, b: string, k: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i]!, clamp(k)))).join(',')})`;
}
/** A sprig of black leaves in a corner (the reference's), swaying a little. */
function sprig(c: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, t: number, a = 1) {
  if (a <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.rotate(rot + 0.03 * Math.sin(t * 0.8)); c.scale(s, s); c.fillStyle = '#1B1B1A'; c.strokeStyle = '#1B1B1A';
  c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(120, 40, 230, 150); c.stroke();
  const leaf = (px: number, py: number, ang: number, len: number) => {
    c.save(); c.translate(px, py); c.rotate(ang + 0.05 * Math.sin(t * 1.1 + px));
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.35, -len * 0.32, len * 0.8, -len * 0.18, len, 0); c.bezierCurveTo(len * 0.8, len * 0.18, len * 0.35, len * 0.32, 0, 0); c.fill(); c.restore();
  };
  [[40, 16, -0.9, 120], [70, 26, 0.9, 130], [115, 48, -0.6, 140], [150, 74, 1.1, 135], [190, 108, -0.3, 150], [215, 135, 1.4, 120], [232, 152, 0.6, 110]].forEach(([px, py, a2, l]) => leaf(px!, py!, a2!, l!));
  c.restore();
}
/** An image object drawn in black-and-white (our renders in grayscale), its soft contact shadow under it. */
function obj(c: CanvasRenderingContext2D, im: HTMLImageElement, cx: number, baseY: number, h: number, o: { a?: number; rot?: number; pivotY?: number; shadow?: number } = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  const w = h * (im.width / im.height);
  c.save(); c.globalAlpha *= a;
  if ((o.shadow ?? 1) > 0) {
    const g = c.createRadialGradient(cx, baseY, 0, cx, baseY, w * 0.55); g.addColorStop(0, `rgba(0,0,0,${0.28 * (o.shadow ?? 1)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(cx, baseY); c.scale(1, 0.16); c.translate(-cx, -baseY); c.fillStyle = g; c.fillRect(cx - w, baseY - w, w * 2, w * 2); c.restore();
  }
  c.translate(cx, baseY - (o.pivotY ?? 0)); c.rotate(o.rot ?? 0); c.filter = 'grayscale(1) contrast(1.12) brightness(1.02)';
  c.drawImage(im, -w / 2, -h + (o.pivotY ?? 0), w, h);
  c.restore();
}

export default class Plan extends Scene {
  bg = new FSPass(FIELD, { t: { value: 0 }, dark: { value: 0 } });
  ui = new Layer2D();
  logo!: Logo; img: Record<string, HTMLImageElement> = {};
  L: Line[] = []; C: number[] = [];

  override async init() {
    this.logo = await loadLogo();
    const load = async (s: string) => { const m = new Image(); m.src = `img/${s}.png`; await m.decode(); return m; };
    for (const k of ['dice', 'thinker', 'pawn', 'phone', 'hourglass', 'suit', 'knight']) this.img[k] = await load(k);
    this.L = this.ctx.lyrics.lines;
    this.C = this.L.map((l, i) => { const p = this.L[i - 1]; const gap = p ? l.start - p.end : 1; return Math.max(0, l.start - Math.min(0.22, Math.max(0.06, gap * 0.45))); });
  }
  W(li: number, q: string): Word { const l = this.L[li]!; return l.words.find((w) => is(norm(w.w), q)) ?? l.words[0]!; }
  out(t: number, t1: number) { return prog(t, t1 - 0.2, t1, ease.inCubic); }

  // ---------------------------------------------------------------- SH0 · profits look impressive… until the plan is tested
  sh0(c: CanvasRenderingContext2D, t: number, t1: number) {
    const o = this.out(t, t1), l0 = this.L[0]!, l1 = this.L[1]!;
    c.save(); c.globalAlpha = 1 - o;
    const lift = ease.inOutCubic(prog(t, this.W(0, K.wow).start - 0.25, this.W(0, K.wow).start + 0.55));
    const cx = W / 2, ty = 1040;
    // the tray, the word under the dome, the dome
    const tg = c.createLinearGradient(cx - 330, 0, cx + 330, 0); tg.addColorStop(0, '#5A5A58'); tg.addColorStop(0.5, '#D8D8D4'); tg.addColorStop(1, '#4A4A48');
    c.save(); c.globalAlpha *= ease.outCubic(prog(t, 0.0, 0.5));
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(cx, ty + 70, 340, 34, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = tg; c.beginPath(); c.ellipse(cx, ty + 52, 330, 38, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2A2A29'; c.beginPath(); c.ellipse(cx, ty + 48, 300, 26, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    if (lift > 0) {
      c.save(); c.globalAlpha *= clamp(lift * 1.6); c.font = font(AR ? 'CairoV@900' : 'Artegra-900', AR ? 150 : 108); c.direction = AR ? 'rtl' : 'ltr'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = INK; c.fillText(l0.words[0]!.w, cx, ty - 4); c.restore();
    }
    const dy = -lift * 330, dr = -lift * 0.5;
    c.save(); c.globalAlpha *= 1 - 0.15 * lift; c.translate(cx + lift * 360, ty + 40 + dy); c.rotate(dr); c.scale(1 - 0.18 * lift, 1 - 0.18 * lift);
    const dg = c.createLinearGradient(-300, -280, 260, 40); dg.addColorStop(0, '#5C5C5A'); dg.addColorStop(0.35, '#1A1A19'); dg.addColorStop(1, '#0C0C0C');
    c.fillStyle = dg; c.beginPath(); c.ellipse(0, 0, 300, 280, 0, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-120, -170, 60, 120, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0E0E0E'; c.beginPath(); c.ellipse(0, 0, 306, 20, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1A1A19'; c.beginPath(); c.ellipse(0, -282, 42, 20, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(0, -300, 24, 0, Math.PI * 2); c.fill();
    c.restore();
    if (lift > 0 && lift < 1) MOTION.fast = true;
    // the rest of line 0 above, then line 1 below with «الخطّة» big in lime
    const rest = { ...l0, words: l0.words.slice(1) } as Line;
    words(c, rest, t, W / 2, 470, { size: 76 });
    words(c, l1, t, W / 2, 1420, { size: 74, big: (w) => (is(w, K.plan) ? 1.7 : 1), accent: (w) => (is(w, K.plan) ? LIME_D : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH1 · trades win, the account grows, confidence rises
  sh1(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), l = this.L[2]!;
    c.save(); c.globalAlpha = 1 - o;
    // stairs: one block per beat of the line, rising to the right
    const ks = K.s.map((q) => this.W(2, q).start);
    const x0 = 150, y0 = 1560, dx = 132, dy = 92, bw = 150, bd = 60;
    for (let i = 0; i < 6; i++) {
      const k = ease.outBack(prog(t, ks[i]! - 0.1, ks[i]! + 0.3)); if (k <= 0) continue;
      const x = x0 + i * dx, top = y0 - (i + 1) * dy - (1 - k) * 60, hgt = (i + 1) * dy;
      c.save(); c.globalAlpha *= clamp(k * 1.4);
      c.fillStyle = '#3A3A39'; c.beginPath(); c.moveTo(x + bw, top); c.lineTo(x + bw + bd, top - bd * 0.55); c.lineTo(x + bw + bd, top - bd * 0.55 + hgt); c.lineTo(x + bw, top + hgt); c.closePath(); c.fill();
      c.fillStyle = '#C9C9C5'; c.beginPath(); c.moveTo(x, top); c.lineTo(x + bd, top - bd * 0.55); c.lineTo(x + bw + bd, top - bd * 0.55); c.lineTo(x + bw, top); c.closePath(); c.fill();
      const fg = c.createLinearGradient(x, top, x, top + hgt); fg.addColorStop(0, '#6A6A68'); fg.addColorStop(1, '#2A2A29');
      c.fillStyle = fg; c.fillRect(x, top, bw, hgt);
      c.restore();
    }
    // the balance counting up
    const ck = ease.inOutCubic(prog(t, ks[2]!, ks[5]! + 0.6)), v = Math.round(lerp(1000, 12480, ck));
    c.save(); c.globalAlpha *= ease.outCubic(prog(t, ks[2]! - 0.2, ks[2]! + 0.2)); c.font = font('Artegra-800', 120); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
    c.fillStyle = INK; c.fillText('$' + v.toLocaleString('en-US'), W / 2, 880);
    c.font = font(AR ? 'CairoV@700' : 'Artegra-600', AR ? 40 : 32); c.direction = AR ? 'rtl' : 'ltr'; c.fillStyle = '#6C6C69'; c.fillText(T.bal, W / 2, 970); c.restore();
    if (ck > 0 && ck < 1) MOTION.fast = true;
    words(c, l, t, W / 2, 520, { size: 70, maxW: W - 220, big: (w) => (K.grow.some((q) => is(w, q)) ? 1.35 : 1) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH2 · then something changes (the hourglass turns)
  sh2(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), turn = ease.inOutCubic(prog(t, this.W(3, K.change).start - 0.05, this.W(3, K.change).start + 0.7));
    c.save(); c.globalAlpha = 1 - o;
    obj(c, this.img.hourglass!, W / 2, 1520, 640, { a: ease.outCubic(prog(t, t0, t0 + 0.4)), rot: turn * Math.PI, pivotY: 320, shadow: 1 - 0.5 * Math.sin(turn * Math.PI) });
    if (turn > 0 && turn < 1) MOTION.fast = true;
    words(c, this.L[3]!, t, W / 2, 640, { size: 86, big: (w) => (is(w, K.change) ? 1.45 : 1) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH3 · breaking news shakes the market
  sh3(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), hit = this.W(4, K.shake).start, sh = pulse(t, hit + 0.05, 0.35) * 14 * Math.sin(t * 70);
    c.save(); c.globalAlpha = 1 - o;
    const ph = this.img.phone!, h = 900, w = h * (ph.width / ph.height), cx = W / 2 + sh, base = 1660;
    obj(c, ph, cx, base, h, { a: ease.outCubic(prog(t, t0, t0 + 0.4)) });
    // the «عاجل» banner drops onto the screen
    const bk = ease.outBack(prog(t, this.W(4, K.news).start, this.W(4, K.news).start + 0.4));
    if (bk > 0) {
      c.save(); c.translate(cx, base - h * 0.72); c.scale(bk, bk);
      c.fillStyle = RED; c.beginPath(); c.roundRect(-w * 0.44, -58, w * 0.88, 116, 18); c.fill();
      c.font = font(AR ? 'CairoV@900' : 'Artegra-900', AR ? 50 : 40); c.direction = AR ? 'rtl' : 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText(T.brk, 0, -10);
      c.font = font(AR ? 'CairoV@600' : 'Artegra-500', AR ? 26 : 20); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillText(T.brk2, 0, 32); c.restore();
    }
    words(c, this.L[4]!, t, W / 2, 470, { size: 80, big: (w) => (is(w, K.sudden) ? 1.35 : 1), accent: (w) => (is(w, K.shake) ? RED : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH4 · the stop loss was never set (no net)
  sh4(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), u = t - t0;
    c.save(); c.globalAlpha = 1 - o;
    const ry = 1080, sag = 34;
    c.strokeStyle = '#2A2A29'; c.lineWidth = 4; c.beginPath(); c.moveTo(-20, ry); c.quadraticCurveTo(W / 2, ry + sag * 2, W + 20, ry); c.stroke();
    // the net under him dissolves on «لم يُوضَع»
    const nk = 1 - ease.inCubic(prog(t, this.W(5, K.set).start - 0.1, this.W(5, K.set).start + 0.6));
    if (nk > 0) {
      c.save(); c.globalAlpha *= nk * 0.8; c.strokeStyle = '#8A8A86'; c.lineWidth = 2.5; c.setLineDash([10, 12]);
      for (let i = 0; i < 7; i++) { const yy = 1430 + i * 26; c.beginPath(); c.moveTo(120 + i * 6, yy); c.quadraticCurveTo(W / 2, yy + 60 * (1 - nk) + 30, W - 120 - i * 6, yy); c.stroke(); }
      for (let i = 0; i <= 12; i++) { const xx = lerp(130, W - 130, i / 12); c.beginPath(); c.moveTo(xx, 1430); c.lineTo(xx + (i - 6) * 3, 1600 + 50 * (1 - nk)); c.stroke(); }
      c.restore();
      if (nk < 1) MOTION.fast = true;
    }
    // the walker: a silhouette with a long pole, a small sway
    const x = lerp(W * 0.32, W * 0.58, prog(u, 0, (t1 - t0) + 0.4)), y = ry + sag * 1.5, sw = 0.06 * Math.sin(u * 3.2);
    c.save(); c.translate(x, y); c.rotate(sw); c.scale(1.35, 1.35); c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 5; c.beginPath(); c.moveTo(-230, -150 + 18 * Math.sin(u * 2)); c.lineTo(230, -150 - 18 * Math.sin(u * 2)); c.stroke();
    c.beginPath(); c.moveTo(-17, -240); c.quadraticCurveTo(0, -250, 17, -240); c.lineTo(13, -118); c.lineTo(-13, -118); c.closePath(); c.fill();   // body
    c.lineWidth = 12; c.beginPath(); c.moveTo(-10, -226); c.lineTo(-70, -156); c.moveTo(10, -226); c.lineTo(70, -152); c.stroke();
    const st = Math.sin(u * 4.5) * 14;
    c.lineWidth = 15; c.beginPath(); c.moveTo(-7, -122); c.lineTo(-16 + st, -2); c.moveTo(7, -122); c.lineTo(16 - st, -2); c.stroke();
    c.beginPath(); c.arc(0, -272, 27, 0, Math.PI * 2); c.fill();
    c.restore();
    MOTION.fast = true;
    words(c, this.L[5]!, t, W / 2, 520, { size: 82, big: (w) => (is(w, K.stop) ? 1.3 : 1), accent: (w) => (is(w, K.set) ? RED : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH5 · and the trade turns against you (the pawn falls)
  sh5(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), f = ease.inCubic(prog(t, this.W(6, K.turn).start, this.W(6, K.turn).start + 0.55));
    const bounce = f >= 1 ? Math.exp(-(t - this.W(6, K.turn).start - 0.55) * 7) * Math.sin((t - this.W(6, K.turn).start - 0.55) * 26) * 0.05 : 0;
    c.save(); c.globalAlpha = 1 - o;
    obj(c, this.img.pawn!, W / 2 - 40, 1500, 620, { a: ease.outCubic(prog(t, t0, t0 + 0.35)), rot: -f * 1.45 + bounce, shadow: 1 - 0.6 * f });
    if (f > 0 && (f < 1 || Math.abs(bounce) > 0.001)) MOTION.fast = true;
    words(c, this.L[6]!, t, W / 2, 560, { size: 92, accent: (w) => (is(w, K.you) ? RED : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH6 · here the real question appears (type only)
  sh6(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1);
    c.save(); c.globalAlpha = 1 - o; c.save(); if (o > 0) c.filter = `blur(${o * 14}px)`;
    words(c, this.L[7]!, t, W / 2, H * 0.47, { size: 78, big: (w) => (is(w, K.question) ? 1.5 : 1) });
    c.restore(); c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH7 · skill… or luck?
  sh7(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), sk = this.W(8, K.skill).start, lk = this.W(8, K.luck).start;
    c.save(); c.globalAlpha = 1 - o;
    const a1 = ease.outCubic(prog(t, sk - 0.3, sk + 0.2)) * (1 - 0.55 * prog(t, lk - 0.2, lk + 0.3));
    obj(c, this.img.thinker!, W / 2 - 170 * prog(t, lk - 0.2, lk + 0.4), 1520, 560, { a: a1 });
    // the die rolls in from the right on «حظًّا»
    const r = ease.outCubic(prog(t, lk - 0.15, lk + 0.75));
    if (r > 0) { obj(c, this.img.dice!, lerp(W + 260, W / 2 + 230, r), 1560, 300, { a: clamp(r * 2), rot: (1 - r) * 4.2, pivotY: 150 }); if (r < 1) MOTION.fast = true; }
    words(c, this.L[8]!, t, W / 2, 560, { size: 84, big: (w) => (is(w, K.skill) || is(w, K.luck) ? 1.45 : 1) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH8 · real profit holds under pressure
  sh8(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), pk = ease.outCubic(prog(t, this.W(9, K.pressure).start - 0.1, this.W(9, K.pressure).start + 0.4));
    c.save(); c.globalAlpha = 1 - o;
    obj(c, this.img.suit!, W / 2, 1640, 760, { a: ease.outCubic(prog(t, t0, t0 + 0.45)) });
    // the pressure: a heavy bar presses down on «الضغط» and stops above his shoulders
    if (pk > 0) {
      const y = lerp(700, 836, pk);
      c.save(); c.globalAlpha *= clamp(pk * 1.5); c.fillStyle = '#1C1C1B'; c.fillRect(150, y - 30, W - 300, 44);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(150, y - 30, W - 300, 8); c.restore();
      if (pk < 1) MOTION.fast = true;
    }
    words(c, this.L[9]!, t, W / 2, 480, { size: 80, big: (w) => (is(w, K.holds) ? 1.55 : 1) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH9 · fragile profit collapses at the first test (dominoes)
  sh9(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), f0 = this.W(10, K.collapse).start - 0.05;
    c.save(); c.globalAlpha = 1 - o;
    const N = 9, by = 1460, gap = 92, x0 = W / 2 + ((N - 1) * gap) / 2;
    for (let i = 0; i < N; i++) {
      const x = x0 - i * gap, start = f0 + i * 0.085, f = ease.inQuad(prog(t, start, start + 0.32));
      const ang = -Math.min(f * 1.18, 1.18) * (i === N - 1 ? 1.35 : 1);
      c.save(); c.globalAlpha *= ease.outCubic(prog(t, t0 + i * 0.04, t0 + 0.35 + i * 0.04));
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.beginPath(); c.ellipse(x - 20 * f, by + 6, 46 + 40 * f, 10, 0, 0, Math.PI * 2); c.fill();
      c.translate(x - 22, by); c.rotate(ang);
      const g = c.createLinearGradient(0, -210, 44, 0); g.addColorStop(0, '#3C3C3B'); g.addColorStop(1, '#0E0E0E');
      c.fillStyle = g; c.beginPath(); c.roundRect(0, -210, 44, 210, 6); c.fill();
      c.fillStyle = '#E8E8E4'; [[22, -160], [22, -120], [22, -70], [22, -40]].forEach(([dx, dy]) => { c.beginPath(); c.arc(dx!, dy!, 5, 0, Math.PI * 2); c.fill(); });
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, -105, 44, 3);
      c.restore();
      if (f > 0 && f < 1) MOTION.fast = true;
    }
    words(c, this.L[10]!, t, W / 2, 560, { size: 80, big: (w) => (is(w, K.collapse) ? 1.5 : 1), accent: (w) => (is(w, K.collapse) ? RED : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH10 · that is why profit needs a plan (the knight)
  sh10(c: CanvasRenderingContext2D, t: number, t0: number, t1: number) {
    const o = this.out(t, t1), k = ease.outCubic(prog(t, t0, t0 + 0.7)), pl = this.W(11, K.plan2).start;
    c.save(); c.globalAlpha = 1 - o;
    const gl = ease.outCubic(prog(t, pl, pl + 0.5));
    if (gl > 0) { const g = c.createRadialGradient(W / 2, 1300, 0, W / 2, 1300, 520); g.addColorStop(0, `rgba(146,199,32,${0.22 * gl})`); g.addColorStop(1, 'rgba(146,199,32,0)'); c.fillStyle = g; c.fillRect(0, 700, W, 1200); }
    obj(c, this.img.knight!, W / 2, 1600 + (1 - k) * 120, 720, { a: k });
    words(c, this.L[11]!, t, W / 2, 520, { size: 80, big: (w) => (is(w, K.plan2) ? 1.7 : 1), accent: (w) => (is(w, K.plan2) ? LIME_D : null) });
    c.restore();
    return {};
  }

  // ---------------------------------------------------------------- SH11 · the end card
  sh11(c: CanvasRenderingContext2D, t: number, t0: number) {
    const l = this.L[12]!, vx = t0 + 0.15, k = prog(t, vx, vx + 0.9);
    const lw = 640, Lg = this.logo, lh = lw * (Lg.H / Lg.W);
    c.save(); c.translate(W / 2 - lw / 2, H / 2 - lh / 2 - 120 + (1 - ease.outCubic(prog(t, vx, vx + 0.5))) * 24);
    drawLockup(c, Lg, lw, { vk: [ease.outCubic(prog(t, vx, vx + 0.35)), ease.outCubic(prog(t, vx + 0.12, vx + 0.47))], lk: [0, 1, 2, 3, 4].map((i) => prog(t, vx + 0.2 + i * 0.07, vx + 0.55 + i * 0.07)), vCol: LIME, lCol: '#F2F2F2' });
    c.restore();
    const tag = { ...l, words: l.words.slice(0, T.tagN) } as Line;
    words(c, tag, t, W / 2, H / 2 + 60, { size: 64, ink: '#F2F2F2', accent: (w) => (is(w, K.plan3) ? LIME : null) });
    const k2 = ease.outCubic(prog(t, vx + 0.7, vx + 1.1));
    c.save(); c.globalAlpha = k2 * 0.85; c.font = font('Artegra-600', 34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillStyle = '#F2F2F2'; c.fillText('vexoda.com', W / 2, H / 2 + 170); c.restore();
    c.save(); c.globalAlpha = k2 * 0.55; c.font = font(AR ? 'CairoV@500' : 'Artegra-500', AR ? 30 : 24); c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = AR ? 'rtl' : 'ltr'; c.fillStyle = '#F2F2F2'; c.fillText(RISK, W / 2, H - 300); c.restore();
    if (k < 1) MOTION.fast = true;
    return { dark: ease.inOutCubic(prog(t, t0 - 0.25, t0 + 0.2)) };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t; const U = this.ui; U.clear(); const c = U.ctx, C = this.C;
    const cuts = [C[2]!, C[3]!, C[4]!, C[5]!, C[6]!, C[7]!, C[8]!, C[9]!, C[10]!, C[11]!, C[12]!];
    let o: { dark?: number };
    if (t < cuts[0]!) o = this.sh0(c, t, cuts[0]!);
    else if (t < cuts[1]!) o = this.sh1(c, t, cuts[0]!, cuts[1]!);
    else if (t < cuts[2]!) o = this.sh2(c, t, cuts[1]!, cuts[2]!);
    else if (t < cuts[3]!) o = this.sh3(c, t, cuts[2]!, cuts[3]!);
    else if (t < cuts[4]!) o = this.sh4(c, t, cuts[3]!, cuts[4]!);
    else if (t < cuts[5]!) o = this.sh5(c, t, cuts[4]!, cuts[5]!);
    else if (t < cuts[6]!) o = this.sh6(c, t, cuts[5]!, cuts[6]!);
    else if (t < cuts[7]!) o = this.sh7(c, t, cuts[6]!, cuts[7]!);
    else if (t < cuts[8]!) o = this.sh8(c, t, cuts[7]!, cuts[8]!);
    else if (t < cuts[9]!) o = this.sh9(c, t, cuts[8]!, cuts[9]!);
    else if (t < cuts[10]!) o = this.sh10(c, t, cuts[9]!, cuts[10]!);
    else o = this.sh11(c, t, cuts[10]!);
    const dark = o.dark ?? 0;
    // the corners and the logo, on every light shot
    if (dark < 1) {
      c.save(); c.globalAlpha = 1 - dark;
      sprig(c, AR ? -30 : -70, AR ? 90 : 40, 0.35, AR ? 1.05 : 0.86, t, ease.outCubic(prog(t, 0, 0.6)));   // English lines reach further left: the sprig sits higher
      sprig(c, W + 30, H - 120, Math.PI + 0.35, 1.0, t + 2, ease.outCubic(prog(t, 0.1, 0.7)));
      const lw = 230, Lg = this.logo, lh = lw * (Lg.H / Lg.W);
      c.save(); c.globalAlpha *= 0.92 * ease.outCubic(prog(t, 0.1, 0.6)); c.translate(W / 2 - lw / 2, 190 - lh / 2); drawLockup(c, Lg, lw, { vCol: LIME, lCol: INK }); c.restore();
      c.restore();
    }
    const bu = this.bg.u; bu.t!.value = t; bu.dark!.value = dark;
    this.bg.render(renderer, out); comp.draw(renderer, U.upload(), out);
    const cut = cuts.reduce((m, s) => Math.max(m, pulse(t, s, 0.08)), 0);
    return { flat: 1, bloom: 0, halation: 0, ca: 0.08 + 0.5 * cut, grain: 0.022, vignette: 0.04, zoom: 1 + 0.012 * cut, zblur: 0.25 * cut, fade: 0 };
  }
}
