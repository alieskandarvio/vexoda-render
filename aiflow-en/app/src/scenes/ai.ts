// AI (ENGLISH cut, left to right) — «Stop guessing», the search → daily-analysis platform reel (after the «From idea to app, powered by Gemini» motion piece:
// prompt bar, chips, typing, the cursor's click with a rubbery bounce, white wipes, analysis cards, a node graph,
// a spark that becomes the brand pill with its world orbiting, a tagline, the logo — vertical 9:16, VEXODA identity).
// Cut on the music (Mixkit 744, 123.05 BPM; a bar = 1.9505 s; the edit's 0 is a downbeat of the track):
//   S0 0.00–4.49   the question, then the turn: «تحتاج إلى تداولٍ أذكى؟» → «توقّف عن التخمين.»
//   S1 4.49–8.79   the search: the bar draws itself, market chips, «الذهب», the cursor, the tap (on bar 4), the wipe
//   S2 8.79–11.71  «تحليل اليوم جاهز.» — the lime field, the starburst of V's, the REAL daily analysis' fields typing in
//   S3 11.71–14.63 white bars sweep → «تحليل بصري.» — three cards land (the falling trend, the RSI 37, today's levels — as the real analysis)
//   S4 14.63–17.56 white frames → «تنظيم الصفقة» — entry / stop / target nodes wired from a spark; the V's outline
//   S5 17.56–20.49 a spark → a ring → the «✦ VEXODA» pill, the platform's world orbiting it on threads
//   S6 20.49–22.44 «من الفكرة إلى الصفقة.» / «بقوّة VEXODA»
//   S7 22.44–end   the lockup, the address, the risk line; fade
// Everything is a pure function of t (no state).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, noise1, prog, pulse, MOTION } from '../engine/util';
import { loadLogo, drawLockup, type Logo } from './_vx';

// ------------------------------------------------------------------ the field: aurora in dark brand tones; per shot a mood
const AURORA = /* glsl */ `
uniform float t; uniform vec2 cam; uniform float zoom; uniform float lift; uniform float limeField; uniform float black; uniform float curve;
vec3 blob(vec2 p, vec2 c, vec2 r, vec3 col) { vec2 d = (p - c) / r; return col * exp(-dot(d, d)); }
void main() {
  vec2 p0 = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec2 p = (p0 - vec2(${W / 2}.0, ${H / 2}.0)) / zoom + cam * 0.35;
  vec3 c = vec3(0.0012, 0.0013, 0.0018);
  c += blob(p, vec2(-260.0 + 120.0 * sin(t * 0.21), -520.0 + 90.0 * sin(t * 0.17)), vec2(560.0, 680.0), vec3(0.004, 0.012, 0.015));
  c += blob(p, vec2(330.0 + 80.0 * sin(t * 0.19 + 1.0), 260.0 + 140.0 * sin(t * 0.23)), vec2(520.0, 640.0), vec3(0.007, 0.012, 0.002));
  c += blob(p, vec2(420.0 + 60.0 * sin(t * 0.27 + 2.0), -120.0), vec2(260.0, 460.0), vec3(0.030, 0.036, 0.046) * (0.5 + 0.5 * lift));
  c += blob(p, vec2(-380.0, 700.0 + 60.0 * sin(t * 0.2)), vec2(480.0, 480.0), vec3(0.005, 0.006, 0.011));
  float n = fbm(vec3(p / 900.0, t * 0.03), 3);
  c *= 0.9 + 0.2 * n;
  // S2: the lime field (the reference's salmon, in the brand's colour): warm olive light from the lower right
  vec3 lf = vec3(0.010, 0.014, 0.004) + blob(p0 - vec2(${W / 2}.0, ${H / 2}.0), vec2(260.0 + 40.0 * sin(t * 0.5), 520.0), vec2(700.0, 900.0), vec3(0.075, 0.14, 0.012))
          + blob(p0 - vec2(${W / 2}.0, ${H / 2}.0), vec2(-420.0, -700.0), vec2(500.0, 500.0), vec3(0.02, 0.03, 0.01));
  c = mix(c, lf * (0.92 + 0.16 * n), limeField);
  // S3: a lime curve rising from the lower right (the reference's blue Gemini spike)
  vec2 q = p0 - vec2(${W}.0 * 0.86, ${H}.0 * 1.02);
  float sp = exp(-pow(abs(q.x) / (40.0 + 0.0009 * q.y * q.y), 2.0)) * smoothstep(-900.0, 0.0, q.y);
  c += vec3(0.16, 0.36, 0.03) * sp * curve;
  c *= 1.0 - black;
  fragColor = vec4(c, 1.0);
}`;

const BEAT = 60 / 123.047, BAR = 4 * BEAT;
const S1 = 7.802 - 3.32;                  // shot 1 starts so that its click lands on bar 4
const S2 = S1 + 4.3, S3 = BAR * 6, S4 = BAR * 7.5, S5 = BAR * 9, S6 = BAR * 10.5, S7 = BAR * 11.5;

const BAR_ = { w: 900, h: 168, y: 0 };
const R = BAR_.h / 2;
const CHIPS = ['Forex', 'Metals', 'Indices', 'Crypto'];
const PROMPT = 'Gold';
const PLACEHOLDER = 'Search a market…';
const LINES = ['// VEXODA daily analysis · XAU/USD', 'Bias: Bearish', 'Pivot point (P): 3,889.76', 'Resistance 1 (R1): 3,911.84', 'Support 1 (S1): 3,856.38', 'Updated after every session close'];
const ORBIT = ['chart-line-up', 'coins', 'currency-btc', 'users-three', 'robot', 'graduation-cap', 'wallet', 'handshake'];

/** A word-by-word reveal out of a soft blur (left to right, Artegra). x is the left edge, the centre or the right edge per align. */
function reveal(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, k: number, o: { wt?: number; col?: string; align?: CanvasTextAlign; accent?: string; accentCol?: string } = {}) {
  if (k <= 0) return;
  c.save();
  c.font = font(`Artegra-${o.wt ?? 600}`, size); c.direction = 'ltr'; c.textBaseline = 'middle';
  const words = s.split(' '), sp = c.measureText(' ').width;
  const ws = words.map((w) => c.measureText(w).width), tot = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  let xl = (o.align ?? 'center') === 'center' ? x - tot / 2 : (o.align === 'left' ? x : x - tot);
  words.forEach((w, i) => {
    const e = clamp(k * (words.length + 1.2) - i);
    if (e > 0) {
      c.save(); c.globalAlpha *= ease.outCubic(clamp(e)); c.filter = `blur(${(1 - e) * 12}px)`;
      c.fillStyle = o.accent && w.includes(o.accent) ? (o.accentCol ?? '#B5EC3A') : (o.col ?? '#F2F3F5');
      c.textAlign = 'left'; c.fillText(w, xl, y + (1 - ease.outCubic(e)) * 14); c.restore();
    }
    xl += ws[i]! + sp;
  });
  c.restore();
  if (k < 1) MOTION.fast = true;
}

export default class AI extends Scene {
  bg = new FSPass(AURORA, { t: { value: 0 }, cam: { value: [0, 0] }, zoom: { value: 1 }, lift: { value: 0 }, limeField: { value: 0 }, black: { value: 0 }, curve: { value: 0 } });
  ui = new Layer2D();
  logo!: Logo;
  icons: HTMLImageElement[] = [];

  override async init() {
    this.logo = await loadLogo();
    this.icons = await Promise.all(ORBIT.map(async (n) => {
      const svg = (await (await fetch(`icons/ph/${n}.svg`)).text()).replace(/fill="currentColor"/, 'fill="#F2F3F5"').replace(/<svg /, '<svg width="256" height="256" ');
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode(); return img;
    }));
  }

  /** The pill's outline as points (centre-origin), optionally stretched like rubber after the click. */
  pill(c: CanvasRenderingContext2D, w: number, h: number, rub: number, phase: number) {
    const r = h / 2, n = 220, pts: [number, number][] = [];
    const L = 2 * (w - h) + 2 * Math.PI * r;
    for (let i = 0; i < n; i++) {
      let s = (i / n) * L, x = 0, y = 0;
      const a = w / 2 - r;
      if (s < 2 * a) { x = a - s; y = -r; }
      else if ((s -= 2 * a) < Math.PI * r) { const q = s / r; x = -a - Math.sin(q) * r; y = -Math.cos(q) * r; }
      else if ((s -= Math.PI * r) < 2 * a) { x = -a + s; y = r; }
      else { s -= 2 * a; const q = s / r; x = a + Math.sin(q) * r; y = Math.cos(q) * r; }
      const along = (x + w / 2) / w;
      const bulge = rub * Math.sin(along * Math.PI * 2.2 - phase) * (1 - along * 0.6) * 22;
      pts.push([x - rub * 10 * (1 - along), y + Math.sign(y) * bulge]);
    }
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  // ================================================================ S0 · the question, the turn
  shot0(c: CanvasRenderingContext2D, t: number) {
    const cy = H / 2;
    const q = prog(t, 0.25, 1.35), out1 = prog(t, 2.05, 2.35, ease.inQuad);
    const turn = prog(t, 2.4, 3.3);
    const arrow = (x: number, y: number, dir: number, a: number) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha = a; c.strokeStyle = '#F2F3F5'; c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.translate(x, y); c.scale(dir, 1);
      c.beginPath(); c.moveTo(22, 0); c.lineTo(-22, 0); c.moveTo(-6, -15); c.lineTo(-22, 0); c.lineTo(-6, 15); c.stroke(); c.restore();
    };
    // the arrow arrives first, alone, then the question grows out of it
    const a0 = prog(t, 0.0, 0.3, ease.outCubic) * (1 - out1);
    const slide = lerp(0, 1, prog(t, 0.25, 1.0, ease.inOutCubic));
    c.save(); c.font = font('Artegra-600', 58);
    const qw = c.measureText('Need smarter trading?').width; c.restore();
    const ax = W / 2 - lerp(0, qw / 2 + 50, slide);
    // the question is pulled out from behind the arrow: whatever is still at or left of it is faded away softly
    c.save(); c.globalAlpha = 1 - out1; reveal(c, 'Need smarter trading?', W / 2 + 20 * (1 - slide), cy, 58, q); c.restore();
    c.save(); c.globalCompositeOperation = 'destination-out';
    const g = c.createLinearGradient(ax + 26, 0, ax + 96, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, cy - 90, ax + 96, 180); c.restore();
    arrow(ax, cy + 2, -1, a0);       // → on the left, the question grows to its right
    // the turn
    c.save(); c.globalAlpha = 1 - prog(t, 4.2, 4.49, ease.inQuad);
    c.font = font('Artegra-600', 58);
    const tw = c.measureText('Stop guessing.').width; c.restore();
    c.save(); c.globalAlpha = 1 - prog(t, 4.2, 4.49, ease.inQuad);
    reveal(c, 'Stop guessing.', W / 2 - 26, cy, 58, turn);
    arrow(W / 2 + tw / 2 + 64 - 26 + 18 * Math.sin(Math.max(0, t - 3.3) * 5) * Math.exp(-Math.max(0, t - 3.3) * 2), cy + 2, 1, prog(t, 3.0, 3.35, ease.outCubic));   // ← after the line, pointing back
    c.restore();
    return { zoom: 1 + 0.06 * prog(t, 0, 4.49, ease.inOutSine), cx: 0, cy: 0, lift: 0.3 };
  }

  // ================================================================ S1 · the prompt (approved)
  shot1(c: CanvasRenderingContext2D, t: number) {
    const BAR = BAR_;
    // ---- camera (world px → screen): starts close on the right half of the bar, eases back, punches into «send»
    const back = prog(t, 0.6, 2.6, ease.inOutCubic);
    const punch = prog(t, 3.72, 4.3, ease.inExpo);
    const sendX = BAR.w / 2 - R, sendY = BAR.y;                 // the go button (right end: English reads left → right)
    let zoom = lerp(2.05, 1.0, back), cx = lerp(-(BAR.w / 2 - 230), 0, back), cy = lerp(-20, -40, back);
    zoom = lerp(zoom, 9, punch); cx = lerp(cx, sendX, punch); cy = lerp(cy, sendY, punch);
    zoom *= 1 + 0.004 * Math.sin(t * 1.3);
    if (back > 0 && back < 1) MOTION.fast = true;
    if (punch > 0) MOTION.fast = true;
    const toScreen = () => { c.setTransform(1, 0, 0, 1, 0, 0); c.translate(W / 2, H / 2); c.scale(zoom, zoom); c.translate(-cx, -cy); };

    // ---- 0 · construction lines
    const lk = prog(t, 0.0, 0.45, ease.outCubic), lf = 1 - prog(t, 0.7, 1.1);
    if (lf > 0) {
      toScreen();
      c.save(); c.globalAlpha = 0.55 * lf; c.strokeStyle = '#E9ECEF'; c.lineWidth = 1.4 / zoom;
      c.beginPath(); c.moveTo(-(BAR.w / 2 + 400) + 1800 * lk, BAR.y - R); c.lineTo(-(BAR.w / 2 + 400), BAR.y - R); c.stroke();
      c.beginPath(); c.moveTo(-(BAR.w / 2 - R), BAR.y - R - 600 * lk); c.lineTo(-(BAR.w / 2 - R), BAR.y + R + 600 * lk); c.stroke();
      c.restore();
    }
    // ---- 1 · the pill: outline draws itself, then frosted fill, then the rubber after the click
    const draw = prog(t, 0.12, 0.62, ease.inOutCubic);
    const fill = prog(t, 0.5, 0.95, ease.outCubic);
    const click = 3.32;
    const rubT = t - click;
    const rub = rubT > 0 ? Math.exp(-rubT * 5.2) * Math.min(1, rubT * 14) : 0;
    const phase = rubT * 26;
    if (rub > 0.01) MOTION.fast = true;
    toScreen();
    c.translate(0, BAR.y);
    // frosted body (a cool gradient, lighter towards the send end, as light falls through)
    if (fill > 0) {
      c.save(); c.scale(-1, 1);
      this.pill(c, BAR.w, BAR.h, rub, phase);
      const g = c.createLinearGradient(BAR.w / 2, 0, -BAR.w / 2, 0);
      g.addColorStop(0, `rgba(255,255,255,${0.035 * fill})`);
      g.addColorStop(0.6, `rgba(210,225,235,${0.075 * fill})`);
      g.addColorStop(1, `rgba(225,240,245,${0.16 * fill})`);
      c.fillStyle = g; c.fill();
      // a soft inner top light
      const g2 = c.createLinearGradient(0, -R, 0, R);
      g2.addColorStop(0, `rgba(255,255,255,${0.06 * fill})`); g2.addColorStop(0.5, 'rgba(255,255,255,0)');
      c.fillStyle = g2; c.fill();
      c.restore();
    }
    // the outline (drawn by length)
    c.save(); c.scale(-1, 1);
    this.pill(c, BAR.w, BAR.h, rub, phase);
    c.strokeStyle = '#F4F6F8'; c.lineWidth = 2.2; c.lineJoin = 'round';
    const per = 2 * (BAR.w - BAR.h) + 2 * Math.PI * R;
    c.setLineDash([per * draw, per * 2]); c.lineDashOffset = 0;
    c.globalAlpha = 0.95;
    c.stroke();
    c.restore();
    // a ring of light runs round the pill after the click
    const ring = prog(t, click + 0.02, click + 0.75, ease.inOutCubic);
    if (ring > 0 && ring < 1) {
      c.save(); c.scale(-1, 1); this.pill(c, BAR.w, BAR.h, rub, phase);
      c.setLineDash([per * 0.16, per]); c.lineDashOffset = -per * ring;
      c.strokeStyle = 'rgba(190,255,90,0.95)'; c.lineWidth = 3.4; c.shadowColor = 'rgba(160,240,60,0.9)'; c.shadowBlur = 18;
      c.stroke(); c.restore();
    }
    // the search lens at the start (left), the «go» button at the end (right)
    const plus = prog(t, 0.62, 0.9, ease.outBack);
    if (plus > 0) {
      c.save(); c.translate(-(BAR.w / 2 - R), 0); c.scale(plus, plus); c.rotate((1 - plus) * 1.2);
      c.strokeStyle = '#F2F2F2'; c.lineWidth = 3.2; c.lineCap = 'round';
      c.beginPath(); c.arc(-3, -3, 15, 0, Math.PI * 2); c.moveTo(8, 8); c.lineTo(19, 19); c.stroke(); c.restore();
    }
    const sendIn = prog(t, 2.35, 2.6, ease.outBack);
    const press = pulse(t, click, 0.12);
    if (sendIn > 0) {
      c.save(); c.translate(sendX + rub * 10 - 6, 0); c.scale(sendIn * (1 - 0.14 * press), sendIn * (1 - 0.14 * press));
      c.fillStyle = '#F4F6F8'; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#0A0B0D'; c.lineWidth = 4.2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-15, 0); c.lineTo(15, 0); c.moveTo(3, -12); c.lineTo(15, 0); c.lineTo(3, 12); c.stroke();
      c.restore();
    }
    // the typed query (left → right), with its caret
    const typed = prog(t, 1.25, 2.3);
    const nChars = Math.floor(typed * PROMPT.length + 0.0001);
    if (t > 0.95) {
      const s = PROMPT.slice(0, Math.max(0, nChars));
      c.save();
      c.font = font('Artegra-600', 58); c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = '#F4F6F8';
      const x0 = -(BAR.w / 2 - R - 46);
      if (nChars <= 0) { c.save(); c.globalAlpha = 0.42 * prog(t, 0.95, 1.15); c.font = font('Artegra-500', 50); c.fillText(PLACEHOLDER, x0, 4); c.restore(); }
      c.fillText(s, x0, 4);
      const w = nChars > 0 ? c.measureText(s).width : 0;
      const blink = t < 2.6 || Math.floor((t - 2.6) / 0.42) % 2 === 0;
      // the caret: at the start of the line (left, before the placeholder) until the first letter, then after the text
      if (blink && t < click) { c.fillStyle = 'rgba(190,255,90,0.95)'; c.fillRect(nChars > 0 ? x0 + w + 6 : x0 - 14, -30, 4, 60); }
      c.restore();
    }
    // ---- 2 · the chips, dropping in above (left → right)
    const chipY = -R - 74;
    c.save();
    c.font = font('Artegra-600', 28); c.direction = 'ltr'; c.textBaseline = 'middle'; c.textAlign = 'center';
    let xr = -(BAR.w / 2 - 6);
    CHIPS.forEach((label, i) => {
      const e = prog(t, 0.72 + 0.07 * i, 1.12 + 0.07 * i, ease.outBack);
      const tw = c.measureText(label).width + 66, hh = 58;
      const x = xr + tw / 2;
      xr += tw + 16;
      if (e <= 0) return;
      const active = i === 1 && t > 1.45;    // «Metals» lights up as «Gold» is typed
      c.save(); c.translate(x, chipY + (1 - e) * -26); c.globalAlpha = clamp(e * 1.3);
      c.beginPath(); c.roundRect(-tw / 2, -hh / 2, tw, hh, hh / 2);
      c.fillStyle = active ? 'rgba(146,199,32,0.16)' : 'rgba(255,255,255,0.05)'; c.fill();
      c.strokeStyle = active ? 'rgba(170,230,60,0.95)' : 'rgba(240,242,245,0.55)'; c.lineWidth = 1.8; c.stroke();
      if (active) { c.shadowColor = 'rgba(160,240,60,0.6)'; c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0; }
      // a small dot glyph before the word (market colour kept to the brand: lime / bone)
      c.fillStyle = active ? '#B5EC3A' : 'rgba(240,242,245,0.75)';
      c.beginPath(); c.arc(-tw / 2 + 26, 1, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#F2F2F2'; c.fillText(label, 8, 2);
      c.restore();
    });
    c.restore();
    // ---- 3 · the cursor (screen space, unaffected by zoom so it stays a cursor)
    const cIn = prog(t, 2.5, 3.28, ease.inOutCubic);
    if (cIn > 0 && t < 3.95) {
      const sx = W / 2 + (sendX - cx) * zoom, sy = H / 2 + (sendY - cy) * zoom;
      const px = lerp(W * 0.8, sx + 18, cIn), py = lerp(H * 0.86, sy + 22, cIn) - 40 * Math.sin(Math.PI * cIn);
      const k = 1 - 0.12 * press;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.save(); c.translate(px, py); c.scale(1.5 * k, 1.5 * k); c.rotate(-0.06);
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 34); c.lineTo(8.5, 26); c.lineTo(15, 40); c.lineTo(20.5, 37.5); c.lineTo(14, 24); c.lineTo(25, 24); c.closePath();
      c.fillStyle = '#F7F8FA'; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.strokeStyle = '#0B0C0E'; c.lineWidth = 1.6; c.stroke();
      c.restore();
      if (cIn < 1) MOTION.fast = true;
    }
    // ---- 4 · the white wipe into the next shot
    const wipe = prog(t, 4.0, 4.3, ease.inOutCubic);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (wipe > 0) {
      c.fillStyle = '#F4F5F2';
      c.fillRect(0, H * (1 - wipe) - 40, W, 40);                 // the leading white bar
      c.fillStyle = '#07080A'; c.fillRect(0, H * (1 - wipe), W, H * wipe);
      MOTION.fast = true;
    }


    return { zoom, cx, cy, lift: fill, press };
  }

  // ================================================================ S2 · «جارٍ التحليل.» on the lime field
  shot2(c: CanvasRenderingContext2D, t: number, T: number) {
    // the brand's starburst: eight V's round a centre, turning, half out of the frame (lower left — Arabic mirrors)
    const cx = W * 0.76, cy = H * 0.74, spin = t * 0.55 + 0.4 * ease.outCubic(prog(t, 0, 0.6));
    const grow = ease.outBack(prog(t, 0.0, 0.5));
    c.save(); c.translate(cx, cy); c.rotate(spin); c.scale(grow, grow);
    c.fillStyle = '#9BD52A';
    for (let i = 0; i < 8; i++) {
      c.save(); c.rotate((i * Math.PI) / 4);
      // a chevron pointing at the centre (the V of the brand, repeated round a circle)
      c.beginPath(); c.moveTo(-92, -520); c.lineTo(0, -250); c.lineTo(92, -520); c.lineTo(48, -520); c.lineTo(0, -372); c.lineTo(-48, -520); c.closePath();
      c.fill(); c.restore();
    }
    c.restore();
    // the real V at the heart of it
    {
      const L = this.logo; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const st of L.vStrokes) for (const q of st) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const sc = (300 * grow) / Math.max(x1 - x0, y1 - y0);
      c.save(); c.translate(cx, cy); c.rotate(0.12 * Math.sin(t * 1.4)); c.scale(sc, sc); c.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      c.fillStyle = '#B5EC3A';
      for (const st of L.vStrokes) { c.beginPath(); st.forEach((q, j) => (j ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.fill(); }
      c.restore();
    }
    // the title with its caret, then the lines typing themselves
    const x0 = 110, y0 = 330;
    const tk = prog(t, 0.15, 0.55);
    c.save(); c.font = font('Artegra-700', 62); c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#F4F6F2';
    const title = 'Today’s analysis is ready.';
    const n = Math.floor(tk * title.length + 1e-4);
    c.fillText(title.slice(0, n), x0, y0);
    const w = c.measureText(title.slice(0, n)).width;
    if (Math.floor(t / 0.36) % 2 === 0 || tk < 1) { c.fillStyle = '#F4F6F2'; c.fillRect(Math.min(x0 + w + 10, W - 60), y0 - 34, 5, 68); }
    c.restore();
    c.save(); c.font = font('Artegra-500', 34); c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle';
    LINES.forEach((ln, i) => {
      const k = prog(t, 0.55 + i * 0.26, 0.55 + i * 0.26 + 0.34);
      if (k <= 0) return;
      const m = Math.floor(k * ln.length + 1e-4);
      c.fillStyle = i === 0 ? 'rgba(244,246,242,0.55)' : 'rgba(244,246,242,0.9)';
      c.fillText(ln.slice(0, m), x0, y0 + 120 + i * 68);
    });
    c.restore();
    c.save(); c.globalAlpha = prog(t, 1.2, 1.6) * 0.7; c.font = font('Artegra-500', 24); c.direction = 'ltr'; c.textAlign = 'left'; c.fillStyle = '#F4F6F2';
    c.fillText('Illustrative example', x0, y0 + 120 + LINES.length * 68 + 30); c.restore();
    MOTION.fast = true;
    // the white bars sweeping up into the next shot
    const wp = prog(t, T - 0.42, T, ease.inOutCubic);
    if (wp > 0) { c.fillStyle = '#F4F5F2'; c.fillRect(0, H * (1 - wp) - 26, W, 26); c.fillRect(0, H * (1 - wp) + 60, W, 12); }
    return { limeField: 1 };
  }

  // ================================================================ S3 · «تحليل بصري.» — three cards
  shot3(c: CanvasRenderingContext2D, t: number, T: number) {
    const inW = 1 - prog(t, 0, 0.32, ease.outCubic);
    if (inW > 0) { c.fillStyle = '#F4F5F2'; c.fillRect(0, H * inW * 0.9 - 26, W, 26); }
    reveal(c, 'Visual analysis.', 110, 520, 66, prog(t, 0.1, 0.55), { wt: 700, align: 'left' });
    const card = (x: number, y: number, w: number, h: number, k: number, draw: (cc: CanvasRenderingContext2D) => void) => {
      const e = ease.outBack(clamp(k)); if (e <= 0) return;
      c.save(); c.translate(x + w / 2, y + h / 2); c.scale(e, e); c.translate(-w / 2, -h / 2); c.globalAlpha = clamp(k * 2);
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
      c.beginPath(); c.roundRect(0, 0, w, h, 30); c.fillStyle = '#EEF1F3'; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
      draw(c); c.restore();
    };
    // 1 · the trend (a small candle chart)
    card(110, 640, 400, 330, prog(t, 0.45, 0.85), (cc) => {
      cc.font = font('Artegra-700', 26); cc.direction = 'ltr'; cc.textAlign = 'left'; cc.fillStyle = '#101214'; cc.fillText('Bias: Bearish', 30, 54);
      for (let i = 0; i < 12; i++) {
        const v = 230 - i * 13 + 18 * Math.sin(i * 1.7), up = i % 3 === 1, x = 36 + i * 28, h2 = 30 + 20 * Math.abs(Math.sin(i * 2.3));
        const y2 = 318 - v * 0.8;   // the candles sit under the label (time runs left → right, so the first, highest one is under it)
        cc.fillStyle = up ? '#7DB11C' : '#C9CED3'; cc.fillRect(x, y2 - h2, 16, h2); cc.fillRect(x + 7, y2 - h2 - 12, 2, h2 + 24);
      }
    });
    // 2 · the strength (a ring)
    card(570, 640, 400, 330, prog(t, 0.6, 1.0), (cc) => {
      cc.font = font('Artegra-700', 26); cc.direction = 'ltr'; cc.textAlign = 'left'; cc.fillStyle = '#101214'; cc.fillText('RSI', 30, 54);
      const k = prog(t, 0.8, 1.6, ease.outCubic);
      cc.lineWidth = 22; cc.lineCap = 'round'; cc.strokeStyle = '#D9DEE2'; cc.beginPath(); cc.arc(200, 190, 92, 0, Math.PI * 2); cc.stroke();
      cc.strokeStyle = '#7DB11C'; cc.beginPath(); cc.arc(200, 190, 92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.37 * k); cc.stroke();
      cc.font = font('Artegra-700', 44); cc.direction = 'ltr'; cc.textAlign = 'center'; cc.fillStyle = '#101214'; cc.fillText(`${Math.round(37 * k)}`, 200, 206);
    });
    // 3 · the summary (bars)
    card(110, 1030, 860, 420, prog(t, 0.8, 1.2), (cc) => {
      cc.font = font('Artegra-700', 28); cc.direction = 'ltr'; cc.textAlign = 'left'; cc.fillStyle = '#101214'; cc.fillText('Today’s levels · Gold', 40, 62);
      const rows: [string, string, number, string][] = [['Resistance 1 (R1)', '3,911.84', 0.86, '#C9CED3'], ['Pivot point (P)', '3,889.76', 0.29, '#2DBFA8'], ['Support 1 (S1)', '3,856.38', 0.57, '#7DB11C'], ['Support 2 (S2)', '3,834.30', 1.14, '#7DB11C']];
      rows.forEach(([lab, val, pct, col], i) => {
        const k = prog(t, 1.0 + i * 0.1, 1.6 + i * 0.1, ease.outCubic);
        cc.font = font('Artegra-600', 24); cc.fillStyle = '#4A5056'; cc.textAlign = 'left'; cc.direction = 'ltr'; cc.fillText(lab, 40, 140 + i * 72);
        cc.font = font('Artegra-600', 26); cc.fillStyle = '#101214'; cc.textAlign = 'right'; cc.fillText(val, 820, 140 + i * 72);
        const bw = 240 * Math.min(1, pct / 1.2) * k;
        cc.fillStyle = '#E1E5E8'; cc.beginPath(); cc.roundRect(380, 118 + i * 72, 240, 26, 13); cc.fill();
        cc.fillStyle = col; cc.beginPath(); cc.roundRect(380, 118 + i * 72, bw, 26, 13); cc.fill();
      });
    });
    c.save(); c.globalAlpha = 0.6 * prog(t, 1.2, 1.6); c.font = font('Artegra-500', 22); c.direction = 'ltr'; c.textAlign = 'left'; c.fillStyle = '#F2F3F5';
    c.fillText('Illustrative example from VEXODA’s daily analysis', 110, 1500); c.restore();
    const wp = prog(t, T - 0.36, T, ease.inOutCubic);
    if (wp > 0) { c.fillStyle = '#F4F5F2'; c.fillRect(W * (1 - wp), 0, 26, H); c.fillRect(W * (1 - wp) + 26, 0, W * wp, H); c.fillStyle = '#050607'; c.fillRect(W * (1 - wp) + 52, 0, W * wp, H); }
    return { curve: prog(t, 0.2, 0.9, ease.outCubic), lift: 0.6 };
  }

  // ================================================================ S4 · «تنظيم الصفقة» — the node graph
  shot4(c: CanvasRenderingContext2D, t: number, T: number) {
    // white frame bars sliding into place (the reference's L-shaped panels)
    const fk = prog(t, 0, 0.4, ease.outCubic);
    c.fillStyle = '#F4F5F2';
    c.fillRect(W - 176 + 300 * (1 - fk), 0, 26, H * 0.66); c.fillRect(W - 1050 + 300 * (1 - fk), H * 0.66 - 26, 900, 26);
    reveal(c, 'Organise the trade', 110, 470, 60, prog(t, 0.15, 0.6), { wt: 700, align: 'left' });
    // the spark and its three nodes
    const sx = 330, sy = 760;
    const sk = ease.outBack(prog(t, 0.3, 0.6));
    const star = (x: number, y: number, r: number) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.22 : r; const px = x + Math.cos(a - Math.PI / 2) * rr, py = y + Math.sin(a - Math.PI / 2) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.fill(); };
    c.fillStyle = '#F4F6F2'; if (sk > 0) star(sx, sy, 46 * sk);
    const nodes: [number, number, string, number][] = [[sx + 360, sy, 'Entry', 0.55], [sx, sy + 300, 'Stop loss', 0.8], [sx + 360, sy + 300, 'Take profit', 1.05]];
    c.strokeStyle = 'rgba(244,246,242,0.85)'; c.lineWidth = 3;
    nodes.forEach(([x, y, lab, t0], i) => {
      const k = prog(t, t0, t0 + 0.35, ease.inOutCubic);
      if (k <= 0) return;
      const fx = i === 2 ? nodes[0]![0] : sx, fy = i === 2 ? nodes[0]![1] : sy;
      c.beginPath(); c.moveTo(fx, fy); c.lineTo(lerp(fx, x, k), lerp(fy, y, k)); c.stroke();
      const dk = ease.outBack(prog(t, t0 + 0.28, t0 + 0.5));
      if (dk > 0) { c.fillStyle = i === 2 ? '#B5EC3A' : '#F4F6F2'; c.beginPath(); c.arc(x, y, 22 * dk, 0, Math.PI * 2); c.fill(); }
      c.save(); c.globalAlpha = prog(t, t0 + 0.35, t0 + 0.6); c.font = font('Artegra-600', 30); c.direction = 'ltr'; c.textAlign = 'center'; c.fillStyle = '#F4F6F2';
      c.fillText(lab, x, i === 0 ? y - 52 : y + 72); c.restore();   // the entry's label sits above it (its wire runs down)
    });
    // the V's outline, large, in the lower left corner (the reference's half-seen logo)
    const vk = prog(t, 0.4, 1.4, ease.inOutCubic);
    if (vk > 0) {
      const L = this.logo, s = 1.15;
      c.save(); c.translate(-180, H * 0.62); c.scale(s, s);
      c.strokeStyle = '#F4F6F2'; c.lineWidth = 26 / s; c.lineJoin = 'round';
      L.vStrokes.forEach((st) => { c.beginPath(); const nn = Math.floor(st.length * vk); st.slice(0, nn).forEach((q, j) => (j ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke(); });
      c.restore();
    }
    MOTION.fast = true;
    return { black: 0.85 };
  }

  // ================================================================ S5 · the spark → ring → «✦ VEXODA», its world orbiting
  shot5(c: CanvasRenderingContext2D, t: number) {
    const cx = W / 2, cy = H / 2;
    const sp = ease.outBack(prog(t, 0.0, 0.35)), ring = prog(t, 0.35, 0.85, ease.inOutCubic), pill = prog(t, 0.95, 1.35, ease.inOutCubic);
    const pw = lerp(150, 600, pill), ph = 150 - 22 * pill;
    // the ring (draws itself) → the pill
    if (ring > 0) {
      c.save(); c.strokeStyle = '#F4F6F2'; c.lineWidth = 3.2;
      c.beginPath(); c.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
      const per = 2 * (pw - ph) + Math.PI * ph;
      c.setLineDash([per * ring, per]); c.stroke(); c.restore();
    }
    // the spark, sliding to the pill's start
    const sx = lerp(cx, cx - pw / 2 + 64, pill);
    c.fillStyle = '#F4F6F2';
    if (sp > 0) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = (i % 2 ? 10 : 44) * sp * lerp(1, 0.7, pill); const px = sx + Math.cos(a - Math.PI / 2) * rr, py = cy + Math.sin(a - Math.PI / 2) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.fill(); }
    // the name inside
    const nk = prog(t, 1.15, 1.5, ease.outCubic);
    if (nk > 0) { c.save(); c.globalAlpha = nk; c.font = font('Artegra-700', 58); c.direction = 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#F4F6F2'; c.fillText('VEXODA', cx + 46, cy + 3); c.restore(); }
    // the orbit: eight icons on threads, turning slowly
    const ok = prog(t, 1.35, 2.0, ease.outCubic);
    if (ok > 0) {
      ORBIT.forEach((_, i) => {
        const a = (i / ORBIT.length) * Math.PI * 2 + t * 0.35 + 0.2;
        const rx = 360, ry = 470, k = ease.outBack(prog(t, 1.35 + i * 0.05, 1.75 + i * 0.05));
        if (k <= 0) return;
        const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
        c.save(); c.globalAlpha = clamp(k) * 0.55; c.strokeStyle = '#F4F6F2'; c.lineWidth = 1.6;
        const ex = Math.cos(a) * (pw / 2 + 8), ey = Math.sin(a) * (ph / 2 + 8);   // threads start on the pill's edge, never across the name
        c.beginPath(); c.moveTo(cx + ex, cy + ey); c.bezierCurveTo(cx + ex * 1.5, cy + ey * 2.2, x - Math.cos(a) * 60, y - Math.sin(a) * 60, x - Math.cos(a) * 52, y - Math.sin(a) * 52); c.stroke(); c.restore();
        c.save(); c.translate(x, y); c.scale(k, k);
        c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.fillStyle = 'rgba(20,22,24,0.9)'; c.fill();
        c.strokeStyle = i % 2 ? 'rgba(244,246,242,0.6)' : 'rgba(181,236,58,0.9)'; c.lineWidth = 2.4; c.stroke();
        c.drawImage(this.icons[i]!, -28, -28, 56, 56); c.restore();
      });
    }
    MOTION.fast = true;
    return { black: 0.9 };
  }

  // ================================================================ S6 · the tagline
  shot6(c: CanvasRenderingContext2D, t: number) {
    reveal(c, 'From idea to trade.', W / 2, H / 2 - 50, 62, prog(t, 0.05, 0.75));
    reveal(c, 'Powered by VEXODA', W / 2, H / 2 + 46, 40, prog(t, 0.6, 1.2), { wt: 500, col: 'rgba(242,243,245,0.75)', accent: 'VEXODA', accentCol: '#B5EC3A' });
    return { lift: 0.5 };
  }

  // ================================================================ S7 · the lockup, the address, the risk line
  shot7(c: CanvasRenderingContext2D, t: number) {
    const k = prog(t, 0.05, 0.6, ease.outCubic);
    if (k > 0) {
      const L = this.logo, lw = 640;
      c.save(); c.globalAlpha = k; c.filter = `blur(${(1 - k) * 12}px)`;
      c.translate(W / 2 - lw / 2, H / 2 - 90 + (1 - k) * 20); drawLockup(c, L, lw, { vCol: '#92C720', lCol: '#F2F2F2' }); c.restore();
    }
    const k2 = prog(t, 0.5, 1.0, ease.outCubic);
    if (k2 > 0) {
      c.save(); c.globalAlpha = k2 * 0.9; c.font = font('Artegra-600', 36); c.direction = 'ltr'; c.textAlign = 'center'; c.fillStyle = '#92C720'; c.fillText('vexoda.com', W / 2, H / 2 + 110); c.restore();
      c.save(); c.globalAlpha = k2 * 0.55; c.font = font('Artegra-500', 24); c.direction = 'ltr'; c.textAlign = 'center'; c.fillStyle = '#F2F2F2';
      c.fillText('Trading involves high risk, and you may lose your capital.', W / 2, H - 260); c.restore();
    }
    return { lift: 0.4 };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const U = this.ui; U.clear();
    const c = U.ctx;
    let o: { zoom?: number; cx?: number; cy?: number; lift?: number; press?: number; limeField?: number; black?: number; curve?: number } = {};
    if (t < S1) o = this.shot0(c, t);
    else if (t < S2) o = this.shot1(c, t - S1);
    else if (t < S3) o = this.shot2(c, t - S2, S3 - S2);
    else if (t < S4) o = this.shot3(c, t - S3, S4 - S3);
    else if (t < S5) o = this.shot4(c, t - S4, S5 - S4);
    else if (t < S6) o = this.shot5(c, t - S5);
    else if (t < S7) o = this.shot6(c, t - S6);
    else o = this.shot7(c, t - S7);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const bu = this.bg.u;
    bu.t!.value = t; bu.cam!.value = [o.cx ?? 0, o.cy ?? 0]; bu.zoom!.value = o.zoom ?? 1; bu.lift!.value = o.lift ?? 0;
    bu.limeField!.value = o.limeField ?? 0; bu.black!.value = o.black ?? 0; bu.curve!.value = o.curve ?? 0;
    this.bg.render(renderer, out);
    comp.draw(renderer, U.upload(), out);
    const press = o.press ?? 0;
    const end = prog(t, this.ctx.end - 1.2, this.ctx.end - 0.05, ease.inQuad);
    const cut = [S1, S2, S3, S4, S5, S6, S7].reduce((m, s) => Math.max(m, pulse(t, s, 0.08)), 0);
    return { bloom: 0.28, bloomThreshold: 0.9, bloomRadius: 0.6, halation: 0, ca: 0.25 + 1.2 * press + 1.0 * cut, grain: 0.03, vignette: 0.3, zoom: 1 + 0.012 * press + 0.01 * cut, fade: end };
  }
}
