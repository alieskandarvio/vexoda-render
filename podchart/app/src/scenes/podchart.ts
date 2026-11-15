// PODCHART — the screen in the «فيكسودا بودكاست» lounge (Ali 11-15: «الشارت… على شاشة جوا الاستديو… متحرك…
// من جوا فيكسودا نفسا… شارت النيتيف تبعنا مش الويب… بقياس الشاشة الكبيرة… موشن وشروحات متل الريلز»).
// The app's native chart (trade26/CandleChart: #111110 field, #10b981 / #ef4444 candles, faint grid, Geist Mono axis,
// lime price tag, analysis levels as dashed lines tagged at the right edge, zones as soft bands) laid out for a 16:9
// screen, on VEXODA's own 4H gold candles, with the episode's annotations drawn in beat by beat.
// This preview runs on a fixed beat sheet (B); the episode keys the same beats to the speakers' words.
//   B.chart   the candles draw in, the header, the price tag
//   B.eqh     Samer: two equal highs → buy-side liquidity (the stops above them)
//   B.sweep   the sweep above 4148.58, the displacement down
//   B.bos     the late-October low 3870.18 breaks → BOS
//   B.pd      the range, equilibrium 4000.5, premium / discount
//   B.ote     OTE 62–79 % (4036–4086) and the 4H FVG 4045.7–4068.7
//   B.lana    Lana: EMA 20 / 50 / 200, weekly pivots P / R1 / S1, the 6-touch zone
//   B.conf    the confluence band, the week's two scenarios, invalidation
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, prog, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';

const BG = '#111110', UP = '#10b981', DN = '#ef4444', GRID = 'rgba(255,255,255,0.05)', AX = '#77736B', TXT = '#F3F1EC', TXT2 = '#A9A59C';
const LIME = '#92C720', AMBER = '#E8B83A', BLUE = 'rgba(59,130,246,0.85)', VIOLET = '#A78BFA', RED = '#F0715A', TEAL = '#2DBFA8';
const B = { chart: 0.2, eqh: 4.0, sweep: 9.0, bos: 14.0, pd: 19.0, ote: 25.0, lana: 31.0, conf: 39.0 };

const FIELD = /* glsl */ `
uniform float t;
void main() {
  vec2 p = vUv - 0.5;
  vec3 c = vec3(0.0060, 0.0060, 0.0056);                       // #111110 (linear)
  c *= 1.0 - 0.35 * smoothstep(0.35, 0.85, length(p * vec2(1.0, 1.4)));
  fragColor = vec4(c, 1.0);
}`;

type D = {
  tf: string; candles: number[][]; eqh: number[]; eqhP: number[]; octLow: number[]; bos: number; weekLow: number[];
  fvg: number[]; fvg2: number[]; eq: number; ote: number[]; ema: Record<string, number>; piv: Record<string, number>;
  zone: number[]; zone2: number[]; price: number;
};

// the plot (the native layout: price axis at the right, time axis below)
const X0 = 40, X1 = 1700, Y0 = 150, Y1 = 960, TA = 1000;
const AR = (wt = 700) => `CairoV@${wt}`;

export default class PodChart extends Scene {
  bg = new FSPass(FIELD, { t: { value: 0 } });
  ui = new Layer2D();
  logo!: Logo; d!: D;

  override async init() {
    this.logo = await loadLogo();
    this.d = await (await fetch('podchart.json')).json();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, U = this.ui; U.clear(); const c = U.ctx, d = this.d, C = d.candles, n = C.length;
    MOTION.fast = true;
    // ---------------------------------------------------------------- the camera: bars shown and the price range
    const FUT = 26;                                                       // empty bars past the last one (the native chart carries on)
    const zOut = ease.inOutCubic(prog(t, B.conf - 0.2, B.conf + 1.2));
    const lo = lerp(3828, 3640, zOut), hi = lerp(4236, 4290, zOut);
    const i0 = 0, i1 = n - 1 + FUT;
    const xOf = (i: number) => lerp(X0 + 10, X1 - 10, (i - i0) / (i1 - i0));
    const yOf = (v: number) => lerp(Y1, Y0, (v - lo) / (hi - lo));
    const pitch = (X1 - X0) / (i1 - i0);
    const xEnd = xOf(n - 1 + FUT);

    // ---------------------------------------------------------------- header: the lockup, the symbol, the timeframe, the price
    const hk = ease.outCubic(prog(t, 0, 0.8));
    c.save(); c.globalAlpha = hk;
    const lw = 190, lh = lw * (this.logo.H / this.logo.W);
    c.save(); c.translate(X0, 52 - lh / 2); drawLockup(c, this.logo, lw, { vCol: LIME, lCol: TXT }); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(X0 + lw + 28, 30, 2, 44);
    c.font = font('Artegra-700', 34); c.fillStyle = TXT; c.textBaseline = 'middle'; c.textAlign = 'left'; c.direction = 'ltr';
    c.fillText('XAU/USD', X0 + lw + 58, 53);
    const sw = c.measureText('XAU/USD').width;
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.roundRect(X0 + lw + 74 + sw, 34, 70, 38, 10); c.fill();
    c.font = font('Geist-600', 22); c.fillStyle = TXT2; c.textAlign = 'center'; c.fillText(d.tf, X0 + lw + 109 + sw, 54);
    c.font = font('Geist-600', 32); c.fillStyle = TXT; c.textAlign = 'right'; c.fillText(d.price.toFixed(2), 1880, 53);
    c.font = font(AR(600), 24); c.fillStyle = TXT2; c.direction = 'rtl'; c.fillText('الذهب · فريم الأربع ساعات', 1880 - 150, 54);
    c.restore();

    // ---------------------------------------------------------------- grid + price axis + time axis (native style)
    const step = lo < 3700 ? 100 : 50;
    c.font = font('Geist-400', 19); c.textBaseline = 'middle'; c.direction = 'ltr';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = yOf(v); if (y < Y0 || y > Y1) continue;
      c.strokeStyle = GRID; c.lineWidth = 1; c.beginPath(); c.moveTo(X0, y); c.lineTo(X1, y); c.stroke();
      c.fillStyle = AX; c.textAlign = 'left'; c.fillText(v.toFixed(2), X1 + 16, y);
    }
    c.textAlign = 'center';
    for (let i = 6; i < n; i += 18) {
      const dt = new Date(C[i]![0]! * 1000), lab = `${dt.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()]}`;
      c.fillStyle = AX; c.fillText(lab, xOf(i), TA);
    }

    // ---------------------------------------------------------------- clip to the plot
    c.save(); c.beginPath(); c.rect(X0, Y0 - 10, X1 - X0, Y1 - Y0 + 20); c.clip();
    const smc = 1 - 0.7 * ease.inOutCubic(prog(t, B.lana - 0.3, B.lana + 0.6)) * (1 - ease.inOutCubic(prog(t, B.conf + 1.6, B.conf + 2.6)));

    // premium / discount (behind the candles)
    const pk = ease.outCubic(prog(t, B.pd, B.pd + 0.8));
    if (pk > 0) {
      const xa = xOf(d.eqh[0]!), top = yOf(d.eqhP[1]!), bot = yOf(d.weekLow[1]!), mid = yOf(d.eq);
      c.save(); c.globalAlpha = pk * smc * (1 - ease.inOutCubic(prog(t, B.lana - 0.3, B.lana + 0.6)));
      c.fillStyle = 'rgba(239,68,68,0.075)'; c.fillRect(xa, top, xEnd - xa, mid - top);
      c.fillStyle = 'rgba(16,185,129,0.075)'; c.fillRect(xa, mid, xEnd - xa, bot - mid);
      c.setLineDash([10, 8]); c.strokeStyle = 'rgba(243,241,236,0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(xa, mid); c.lineTo(lerp(xa, xEnd, pk), mid); c.stroke(); c.setLineDash([]);
      c.restore();
    }
    // the 6-touch resistance zone + OTE band (soft bands, native analysis style)
    const zk = ease.outCubic(prog(t, B.lana + 3.2, B.lana + 4.0));
    if (zk > 0) band(c, X0, X1, yOf(d.zone[1]!), yOf(d.zone[0]!), RED, zk);
    const ok = ease.outCubic(prog(t, B.ote, B.ote + 0.8));
    if (ok > 0) { band(c, xOf(d.eqh[1]!), xEnd, yOf(d.ote[1]!), yOf(d.ote[0]!), LIME, ok * smc * 1.6); }
    // the 4H FVG: the gap the displacement left, extended to the right until it is filled
    const fk = ease.outCubic(prog(t, B.ote + 1.6, B.ote + 2.4));
    if (fk > 0) {
      const xa = xOf(d.fvg[0]! - 1), ya = yOf(d.fvg[2]!), yb = yOf(d.fvg[1]!);
      c.save(); c.globalAlpha = fk * smc; c.fillStyle = 'rgba(167,139,250,0.22)'; c.fillRect(xa, ya, lerp(0, xEnd - xa, fk), yb - ya);
      c.strokeStyle = VIOLET; c.lineWidth = 2; c.strokeRect(xa, ya, lerp(0, xEnd - xa, fk), yb - ya); c.restore();
    }

    // the candles (they draw in left to right)
    const shown = n * ease.outCubic(prog(t, B.chart, B.chart + 2.8));
    const disp = prog(t, B.sweep + 1.2, B.sweep + 2.4);
    for (let i = 0; i < Math.min(n, Math.ceil(shown)); i++) {
      const k = C[i]!, up = k[4]! >= k[1]!, x = xOf(i), a = clamp(shown - i);
      const hot = i > d.eqh[1]! && i <= d.bos && disp > 0 && !up;   // the displacement leg, lit
      c.save(); c.globalAlpha = a;
      c.strokeStyle = up ? UP : DN; c.fillStyle = up ? UP : DN; c.lineWidth = 2;
      if (hot) { c.shadowColor = DN; c.shadowBlur = 18 * disp; }
      c.beginPath(); c.moveTo(x, yOf(k[2]!)); c.lineTo(x, yOf(k[3]!)); c.stroke();
      const yt = yOf(Math.max(k[1]!, k[4]!)), yb = yOf(Math.min(k[1]!, k[4]!));
      c.beginPath(); c.roundRect(x - pitch * 0.34, yt, pitch * 0.68, Math.max(2, yb - yt), 2); c.fill();
      c.restore();
    }
    // the last price: the blue bid line + the lime tag at the axis (drawn outside the clip below)
    const lk = prog(t, B.chart + 2.6, B.chart + 3.0), yP = yOf(d.price);
    if (lk > 0) { c.save(); c.globalAlpha = lk; c.strokeStyle = BLUE; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X0, yP); c.lineTo(X1, yP); c.stroke(); c.restore(); }

    // ---------------------------------------------------------------- SMC: EQH → liquidity → sweep → BOS
    const ek = ease.outCubic(prog(t, B.eqh, B.eqh + 0.7));
    if (ek > 0) {
      c.save(); c.globalAlpha = ek * smc;
      const yH = yOf(d.eqhP[0]!);
      c.setLineDash([6, 7]); c.strokeStyle = TXT; c.lineWidth = 2; c.beginPath(); c.moveTo(xOf(d.eqh[0]!) - 10, yH); c.lineTo(lerp(xOf(d.eqh[0]!), xOf(d.eqh[1]!) + 30, ek), yH); c.stroke(); c.setLineDash([]);
      d.eqh.forEach((bi, j) => { const r = ease.outBack(prog(t, B.eqh + 0.3 + j * 0.35, B.eqh + 0.8 + j * 0.35)); ring(c, xOf(bi!), yOf(d.eqhP[j]!), 18 * r); });
      // the stops resting above: small «SL» chips
      for (let j = 0; j < 5; j++) {
        const sk = ease.outBack(prog(t, B.eqh + 1.6 + j * 0.12, B.eqh + 2.0 + j * 0.12)); if (sk <= 0) continue;
        const x = lerp(xOf(d.eqh[0]!) + 40, xOf(d.eqh[1]!) - 30, j / 4), y = yH - 44 - (j % 2) * 30;
        c.save(); c.translate(x, y); c.scale(sk, sk); c.fillStyle = 'rgba(239,68,68,0.9)'; c.beginPath(); c.roundRect(-22, -13, 44, 26, 7); c.fill();
        c.font = font('Geist-600', 15); c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SL', 0, 1); c.restore();
      }
      c.restore();
    }
    const sk = prog(t, B.sweep, B.sweep + 1.0);
    if (sk > 0) {                                                        // the wick through the line, a flash, the arrow down
      const x = xOf(d.eqh[1]!), y = yOf(d.eqhP[1]!);
      c.save(); c.globalAlpha = smc;
      const fl = Math.exp(-((t - B.sweep - 0.25) ** 2) / 0.02);
      c.fillStyle = `rgba(146,199,32,${0.55 * fl})`; c.beginPath(); c.arc(x, y, 36 + 30 * fl, 0, Math.PI * 2); c.fill();
      const ak = ease.inOutCubic(prog(t, B.sweep + 0.6, B.sweep + 2.2));
      arrow(c, x + 20, y + 10, lerp(x + 20, xOf(d.bos) - 10, ak), lerp(y + 10, yOf(d.weekLow[1]!) - 20, ak), LIME, 4, ak);
      c.restore();
    }
    const bk = ease.outCubic(prog(t, B.bos, B.bos + 0.8));
    if (bk > 0) {
      const xa = xOf(d.octLow[0]!), y = yOf(d.octLow[1]!), xb = xOf(d.bos);
      c.save(); c.globalAlpha = smc; c.strokeStyle = AMBER; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(xa, y); c.lineTo(lerp(xa, xb + 40, bk), y); c.stroke();
      ring(c, xa, y, 14 * bk, AMBER);
      const xk = ease.outBack(prog(t, B.bos + 0.6, B.bos + 1.1));
      if (xk > 0) { c.save(); c.translate(xb, y); c.scale(xk, xk); c.fillStyle = AMBER; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill(); c.restore(); }
      c.restore();
    }

    // ---------------------------------------------------------------- Lana: EMAs, pivots
    const levels: [string, number, string, number][] = [
      ['EMA 20', d.ema['20']!, '#5AA9FF', B.lana], ['EMA 50', d.ema['50']!, '#F5A524', B.lana + 0.25], ['EMA 200', d.ema['200']!, VIOLET, B.lana + 0.5],
      ['P', d.piv.P!, AMBER, B.lana + 1.6], ['R1', d.piv.R1!, RED, B.lana + 1.85], ['S1', d.piv.S1!, TEAL, B.lana + 2.1],
      ['R2', d.piv.R2!, RED, B.conf + 0.9], ['S2', d.piv.S2!, TEAL, B.conf + 1.05],
    ];
    const tags: [string, number, string, number][] = [];
    for (const [lab, v, col, t0] of levels) {
      const k = ease.outCubic(prog(t, t0, t0 + 0.9)); if (k <= 0) continue;
      const y = yOf(v), ema = lab.startsWith('EMA');
      c.save(); c.globalAlpha = k * (ema ? 0.9 : 0.85); c.strokeStyle = col; c.lineWidth = ema ? 3 : 2; c.setLineDash(ema ? [] : [10, 8]);
      c.beginPath(); c.moveTo(X0, y); c.lineTo(lerp(X0, X1, k), y); c.stroke(); c.restore();
      tags.push([`${lab} ${v.toFixed(2)}`, y, col, k]);
    }
    // the confluence: one band glowing over SMC's OTE / FVG and Lana's R1 / zone / EMA 20
    const ck = ease.outCubic(prog(t, B.conf + 2.4, B.conf + 3.2));
    if (ck > 0) {
      const ya = yOf(d.ote[1]!), yb = yOf(d.ote[0]!), gl = 0.5 + 0.5 * Math.sin((t - B.conf) * 3.2);
      c.save(); c.globalAlpha = ck; c.shadowColor = LIME; c.shadowBlur = 30 + 20 * gl; c.strokeStyle = LIME; c.lineWidth = 3; c.strokeRect(X0 + 4, ya, X1 - X0 - 8, yb - ya);
      c.shadowBlur = 0; c.fillStyle = `rgba(146,199,32,${0.10 + 0.05 * gl})`; c.fillRect(X0 + 4, ya, X1 - X0 - 8, yb - ya); c.restore();
    }
    // the week's scenarios from the last bar: the base case (the bounce into the band, then down) and the invalidation
    const s1 = ease.inOutCubic(prog(t, B.conf + 3.6, B.conf + 6.0));
    if (s1 > 0) {
      const xs = xOf(n - 1), pts: [number, number][] = [[xs, yP], [xOf(n + 6), yOf(4060)], [xOf(n + 13), yOf(3852)], [xOf(n + 22), yOf(d.piv.S1!)]];
      path(c, pts, s1, LIME, 4);
      const s2 = ease.inOutCubic(prog(t, B.conf + 5.0, B.conf + 6.6));
      if (s2 > 0) { c.save(); c.setLineDash([3, 10]); path(c, [[xOf(n + 6), yOf(4060)], [xOf(n + 12), yOf(4150)], [xOf(n + 20), yOf(d.piv.R2!)]], s2, 'rgba(243,241,236,0.6)', 3); c.restore(); }
    }
    c.restore();   // end of the plot clip

    // ---------------------------------------------------------------- the right-edge tags (native: a rounded tag on the axis)
    if (lk > 0) tag(c, d.price.toFixed(2), yP, LIME, '#141414', lk);
    for (const [s, y, col, k] of tags) tag(c, s, y, col, '#141414', k, 132);

    // ---------------------------------------------------------------- the callouts (Arabic + the Latin term), like the reels
    const call = (x: number, y: number, ar: string, en: string, t0: number, t1: number, col = TXT, anchor: 'l' | 'r' = 'l') => {
      const k = ease.outBack(prog(t, t0, t0 + 0.45)) * (1 - prog(t, t1 - 0.3, t1)); if (k <= 0) return;
      c.save(); c.globalAlpha = clamp(k); c.font = font(AR(800), 34); c.direction = 'rtl';
      const wa = c.measureText(ar).width; c.font = font('Artegra-700', 22); c.direction = 'ltr'; const we = c.measureText(en).width;
      const w = Math.max(wa, we) + 44, h = 92, bx = anchor === 'l' ? x : x - w;
      c.translate(bx + w / 2, y); c.scale(0.9 + 0.1 * clamp(k), 0.9 + 0.1 * clamp(k));
      c.fillStyle = 'rgba(14,14,13,0.9)'; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 16); c.fill(); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = font(AR(800), 34); c.direction = 'rtl'; c.fillStyle = TXT; c.fillText(ar, 0, -14);
      c.font = font('Artegra-700', 22); c.direction = 'ltr'; c.fillStyle = col; c.fillText(en, 0, 24);
      c.restore();
    };
    const end = 60;
    call(xOf(d.eqh[0]!) - 60, yOf(d.eqhP[0]!) - 150, 'قمم متساوية = سيولة', 'EQUAL HIGHS · BUY-SIDE LIQUIDITY', B.eqh + 0.8, B.sweep, TXT, 'r');
    call(xOf(d.eqh[1]!) + 60, yOf(d.eqhP[1]!) - 70, 'سحب السيولة', 'LIQUIDITY SWEEP', B.sweep + 0.4, B.bos, LIME);
    call(xOf(d.bos) + 50, yOf(d.octLow[1]!) + 90, 'كسر هيكل هابط', 'BREAK OF STRUCTURE · BOS', B.bos + 0.9, B.pd, AMBER);
    call(xOf(n + 2), yOf(4110), 'غالي · منطقة بيع', 'PREMIUM', B.pd + 0.7, B.ote, DN);
    call(xOf(n + 2), yOf(3920), 'رخيص · منطقة شراء', 'DISCOUNT', B.pd + 1.0, B.ote, UP);
    call(X1 - 20, yOf(d.eq) - 10, 'التوازن 4000.5', 'EQUILIBRIUM 50%', B.pd + 1.3, B.ote, TXT, 'r');
    call(xOf(d.fvg[0]!) - 260, yOf(4140), 'دخول مثالي', 'OTE 62–79% · 4036 – 4086', B.ote + 0.6, B.lana, LIME, 'r');
    call(xOf(d.fvg[0]!) - 260, yOf(3980), 'فجوة القيمة العادلة', 'FVG 4045.7 – 4068.7', B.ote + 2.2, B.lana, VIOLET, 'r');
    call(X0 + 40, yOf(4200), 'المتوسطات: السعر تحتها كلها', 'EMA 20 · 50 · 200', B.lana + 0.6, B.lana + 3.2, '#5AA9FF');
    call(X0 + 40, yOf(4200), 'النقاط المحورية الأسبوعية', 'WEEKLY PIVOTS · VEXODA', B.lana + 2.4, B.lana + 5.2, AMBER);
    call(X0 + 40, yOf(4200), 'منطقة مقاومة · ارتدّ منها 6 مرات', 'ZONE 4041 – 4075 · ×6', B.lana + 4.2, B.conf, RED);
    call(X0 + 40, yOf(4205), 'منطقة الالتقاء: المدرستان', 'CONFLUENCE 4036 – 4086', B.conf + 2.8, B.conf + 5.4, LIME);
    call(xOf(n + 10) - 20, yOf(3760), 'السيناريو الأساسي', 'BASE CASE · SELL THE BOUNCE', B.conf + 5.0, end, LIME, 'r');
    call(xOf(n + 9), yOf(4196), 'إغلاق فوق 4148.58 = إلغاء', 'INVALIDATION', B.conf + 6.2, end, TXT2, 'r');

    const bu = this.bg.u; bu.t!.value = t;
    this.bg.render(renderer, out); comp.draw(renderer, U.upload(), out);
    return { flat: 1, bloom: 0, halation: 0, ca: 0, grain: 0.012, vignette: 0, zoom: 1, zblur: 0, fade: 0 };
  }
}

function band(c: CanvasRenderingContext2D, xa: number, xb: number, ya: number, yb: number, col: string, k: number) {
  c.save(); c.globalAlpha = clamp(k); c.fillStyle = col; c.globalAlpha = clamp(k) * 0.1; c.fillRect(xa, ya, (xb - xa) * clamp(k * 1.2), yb - ya);
  c.globalAlpha = clamp(k) * 0.45; c.strokeStyle = col; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(xa, ya); c.lineTo(xa + (xb - xa) * clamp(k * 1.2), ya); c.moveTo(xa, yb); c.lineTo(xa + (xb - xa) * clamp(k * 1.2), yb); c.stroke(); c.restore();
}
function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, col = '#F3F1EC') {
  if (r <= 0) return; c.save(); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
}
function arrow(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w: number, k: number) {
  if (k <= 0) return;
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + 60, (y0 + y1) / 2 - 40, x1, y1); c.stroke();
  if (k > 0.85) { const a = Math.atan2(y1 - y0, x1 - x0) + 0.25; c.translate(x1, y1); c.rotate(a); c.beginPath(); c.moveTo(10, 0); c.lineTo(-14, -11); c.lineTo(-14, 11); c.closePath(); c.fill(); }
  c.restore();
}
function path(c: CanvasRenderingContext2D, pts: [number, number][], k: number, col: string, w: number) {
  // draw the polyline up to k of its length, an arrowhead at the tip
  const L: number[] = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const goal = L[L.length - 1]! * clamp(k);
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]);
  let tip = pts[0]!, dir = 0;
  for (let i = 1; i < pts.length; i++) {
    if (L[i]! <= goal) { c.lineTo(pts[i]![0], pts[i]![1]); tip = pts[i]!; dir = Math.atan2(pts[i]![1] - pts[i - 1]![1], pts[i]![0] - pts[i - 1]![0]); continue; }
    const u = (goal - L[i - 1]!) / (L[i]! - L[i - 1]!), x = lerp(pts[i - 1]![0], pts[i]![0], u), y = lerp(pts[i - 1]![1], pts[i]![1], u);
    c.lineTo(x, y); tip = [x, y]; dir = Math.atan2(pts[i]![1] - pts[i - 1]![1], pts[i]![0] - pts[i - 1]![0]); break;
  }
  c.stroke(); c.setLineDash([]);
  c.translate(tip[0], tip[1]); c.rotate(dir); c.beginPath(); c.moveTo(12, 0); c.lineTo(-12, -10); c.lineTo(-12, 10); c.closePath(); c.fill();
  c.restore();
}
function tag(c: CanvasRenderingContext2D, s: string, y: number, col: string, ink: string, k: number, w = 112) {
  if (k <= 0) return;
  c.save(); c.globalAlpha = clamp(k); c.fillStyle = col; c.beginPath(); c.roundRect(X1 + 6, y - 17, w + 60, 34, 8); c.fill();
  c.font = font('Geist-600', 18); c.fillStyle = ink; c.textAlign = 'left'; c.textBaseline = 'middle'; c.direction = 'ltr'; c.fillText(s, X1 + 16, y + 1); c.restore();
}
