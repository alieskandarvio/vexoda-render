// AI — «مساعد VEXODA», the AI-flow platform reel (after the «From idea to app, powered by Gemini» motion piece:
// a prompt bar that draws itself, chips, typing, the cursor's click with a rubbery bounce, white wipes, logo reveals —
// rebuilt vertical 9:16, in VEXODA's identity: black, the lime, Cairo/Artegra, aurora fields in dark brand tones).
//
// SHOT 1 (0.0–4.3) the prompt:
//   0.00–0.55  thin white construction lines run across the frame; the pill's outline draws itself along them
//   0.55–1.05  the pill fills with frosted light, «+» pops, four chips drop in above (فوركس · ذهب · كريبتو · أخرى)
//   1.05–2.55  «حلّل الذهب الآن» is typed (right to left, a blinking caret), the camera eases back
//   2.55–3.30  the cursor glides in from the lower left to the send button
//   3.30–3.70  click: the button dips, the pill stretches like rubber and settles, a ring of light runs round it
//   3.70–4.30  the camera punches into the button; a white wipe opens the next shot
// Everything is a pure function of t (no state), laid out in world px and seen through a 2D camera.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { font } from '../engine/type';
import { clamp, ease, lerp, noise1, prog, pulse, MOTION } from '../engine/util';

// ------------------------------------------------------------------ the aurora field (dark brand tones, slow)
const AURORA = /* glsl */ `
uniform float t; uniform vec2 cam; uniform float zoom; uniform float lift;
vec3 blob(vec2 p, vec2 c, vec2 r, vec3 col) { vec2 d = (p - c) / r; return col * exp(-dot(d, d)); }
void main() {
  vec2 p = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  p = (p - vec2(${W / 2}.0, ${H / 2}.0)) / zoom + cam * 0.35;      // the field drifts a third as fast as the camera
  vec3 c = vec3(0.0012, 0.0013, 0.0018);
  c += blob(p, vec2(-260.0 + 120.0 * sin(t * 0.21), -520.0 + 90.0 * sin(t * 0.17)), vec2(560.0, 680.0), vec3(0.004, 0.012, 0.015));   // deep teal
  c += blob(p, vec2(330.0 + 80.0 * sin(t * 0.19 + 1.0), 260.0 + 140.0 * sin(t * 0.23)), vec2(520.0, 640.0), vec3(0.007, 0.012, 0.002)); // olive lime
  c += blob(p, vec2(420.0 + 60.0 * sin(t * 0.27 + 2.0), -120.0), vec2(260.0, 460.0), vec3(0.030, 0.036, 0.046) * (0.5 + 0.5 * lift)); // the cool highlight
  c += blob(p, vec2(-380.0, 700.0 + 60.0 * sin(t * 0.2)), vec2(480.0, 480.0), vec3(0.005, 0.006, 0.011));                              // steel
  float n = fbm(vec3(p / 900.0, t * 0.03), 3);
  c *= 0.9 + 0.2 * n;
  fragColor = vec4(c, 1.0);
}`;

// ------------------------------------------------------------------ world layout (px, origin at the frame centre)
const BAR = { w: 900, h: 168, y: 0 };          // the prompt pill
const R = BAR.h / 2;
const CHIPS = ['فوركس', 'ذهب', 'كريبتو', 'أخرى'];
const PROMPT = 'حلّل الذهب الآن';

export default class AI extends Scene {
  bg = new FSPass(AURORA, { t: { value: 0 }, cam: { value: [0, 0] }, zoom: { value: 1 }, lift: { value: 0 } });
  ui = new Layer2D();

  /** The pill's outline as points (centre-origin), optionally stretched like rubber after the click. */
  pill(c: CanvasRenderingContext2D, w: number, h: number, rub: number, phase: number) {
    const r = h / 2, n = 220, pts: [number, number][] = [];
    // perimeter param: two straight runs + two half circles
    const L = 2 * (w - h) + 2 * Math.PI * r;
    for (let i = 0; i < n; i++) {
      let s = (i / n) * L, x = 0, y = 0;
      const a = w / 2 - r;
      if (s < 2 * a) { x = a - s; y = -r; }                                                    // top, right → left
      else if ((s -= 2 * a) < Math.PI * r) { const q = s / r; x = -a - Math.sin(q) * r; y = -Math.cos(q) * r; }   // left cap
      else if ((s -= Math.PI * r) < 2 * a) { x = -a + s; y = r; }                                // bottom, left → right
      else { s -= 2 * a; const q = s / r; x = a + Math.sin(q) * r; y = Math.cos(q) * r; }        // right cap
      // rubber: a travelling bulge along the long edges, strongest near the clicked end (left), decaying
      const along = (x + w / 2) / w;                                                             // 0 at the left end
      const bulge = rub * Math.sin(along * Math.PI * 2.2 - phase) * (1 - along * 0.6) * 22;
      pts.push([x - rub * 10 * (1 - along), y + Math.sign(y) * bulge]);
    }
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const U = this.ui; U.clear();
    const c = U.ctx;

    // ---- camera (world px → screen): starts close on the right half of the bar, eases back, punches into «send»
    const back = prog(t, 0.6, 2.6, ease.inOutCubic);
    const punch = prog(t, 3.72, 4.3, ease.inExpo);
    const sendX = -BAR.w / 2 + R, sendY = BAR.y;                // the send button (left end: Arabic reads right → left)
    let zoom = lerp(2.05, 1.0, back), cx = lerp(BAR.w / 2 - 230, 0, back), cy = lerp(-20, -40, back);
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
      c.beginPath(); c.moveTo(BAR.w / 2 + 400 - 1800 * lk, BAR.y - R); c.lineTo(BAR.w / 2 + 400, BAR.y - R); c.stroke();
      c.beginPath(); c.moveTo(BAR.w / 2 - R, BAR.y - R - 600 * lk); c.lineTo(BAR.w / 2 - R, BAR.y + R + 600 * lk); c.stroke();
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
      c.save();
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
    c.save();
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
      c.save(); this.pill(c, BAR.w, BAR.h, rub, phase);
      c.setLineDash([per * 0.16, per]); c.lineDashOffset = -per * ring;
      c.strokeStyle = 'rgba(190,255,90,0.95)'; c.lineWidth = 3.4; c.shadowColor = 'rgba(160,240,60,0.9)'; c.shadowBlur = 18;
      c.stroke(); c.restore();
    }
    // «+» at the start (right), the send button at the end (left)
    const plus = prog(t, 0.62, 0.9, ease.outBack);
    if (plus > 0) {
      c.save(); c.translate(BAR.w / 2 - R, 0); c.scale(plus, plus); c.rotate((1 - plus) * 1.2);
      c.strokeStyle = '#F2F2F2'; c.lineWidth = 3.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-17, 0); c.lineTo(17, 0); c.moveTo(0, -17); c.lineTo(0, 17); c.stroke(); c.restore();
    }
    const sendIn = prog(t, 2.35, 2.6, ease.outBack);
    const press = pulse(t, click, 0.12);
    if (sendIn > 0) {
      c.save(); c.translate(sendX - rub * 10 + 6, 0); c.scale(sendIn * (1 - 0.14 * press), sendIn * (1 - 0.14 * press));
      c.fillStyle = '#F4F6F8'; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#0A0B0D'; c.lineWidth = 4.2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(0, 15); c.lineTo(0, -15); c.moveTo(-12, -3); c.lineTo(0, -15); c.lineTo(12, -3); c.stroke();
      c.restore();
    }
    // the typed prompt (right → left), with its caret
    const typed = prog(t, 1.05, 2.45);
    const nChars = Math.floor(typed * PROMPT.length + 0.0001);
    if (t > 0.95) {
      const s = PROMPT.slice(0, Math.max(0, nChars));
      c.save();
      c.font = font('CairoV@600', 66); c.direction = 'rtl'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = '#F4F6F8';
      const x0 = BAR.w / 2 - R - 46;
      c.fillText(s, x0, 6);
      const w = c.measureText(s).width;
      const blink = t < 2.6 || Math.floor((t - 2.6) / 0.42) % 2 === 0;
      if (blink && t < click) { c.fillStyle = 'rgba(190,255,90,0.95)'; c.fillRect(x0 - w - 8, -32, 4, 64); }
      c.restore();
    }
    // ---- 2 · the chips, dropping in above (right → left)
    const chipY = -R - 74;
    c.save();
    c.font = font('CairoV@600', 34); c.direction = 'rtl'; c.textBaseline = 'middle'; c.textAlign = 'center';
    let xr = BAR.w / 2 - 6;
    CHIPS.forEach((label, i) => {
      const e = prog(t, 0.72 + 0.07 * i, 1.12 + 0.07 * i, ease.outBack);
      const tw = c.measureText(label).width + 66, hh = 58;
      const x = xr - tw / 2;
      xr -= tw + 16;
      if (e <= 0) return;
      const active = i === 1 && t > 1.6;     // «ذهب» lights up as it is typed
      c.save(); c.translate(x, chipY + (1 - e) * -26); c.globalAlpha = clamp(e * 1.3);
      c.beginPath(); c.roundRect(-tw / 2, -hh / 2, tw, hh, hh / 2);
      c.fillStyle = active ? 'rgba(146,199,32,0.16)' : 'rgba(255,255,255,0.05)'; c.fill();
      c.strokeStyle = active ? 'rgba(170,230,60,0.95)' : 'rgba(240,242,245,0.55)'; c.lineWidth = 1.8; c.stroke();
      if (active) { c.shadowColor = 'rgba(160,240,60,0.6)'; c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0; }
      // a small dot glyph before the word (market colour kept to the brand: lime / bone)
      c.fillStyle = active ? '#B5EC3A' : 'rgba(240,242,245,0.75)';
      c.beginPath(); c.arc(tw / 2 - 26, 2, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#F2F2F2'; c.fillText(label, -6, 4);
      c.restore();
    });
    c.restore();
    // ---- 3 · the cursor (screen space, unaffected by zoom so it stays a cursor)
    const cIn = prog(t, 2.5, 3.28, ease.inOutCubic);
    if (cIn > 0 && t < 3.95) {
      const sx = W / 2 + (sendX - cx) * zoom, sy = H / 2 + (sendY - cy) * zoom;
      const px = lerp(W * 0.2, sx + 18, cIn), py = lerp(H * 0.86, sy + 22, cIn) - 40 * Math.sin(Math.PI * cIn);
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

    // ---- composite
    const bu = this.bg.u;
    bu.t!.value = t; bu.cam!.value = [cx, cy]; bu.zoom!.value = zoom; bu.lift!.value = fill;
    this.bg.render(renderer, out);
    comp.draw(renderer, U.upload(), out);
    return { bloom: 0.28, bloomThreshold: 0.9, bloomRadius: 0.6, halation: 0, ca: 0.25 + 1.2 * press, grain: 0.03, vignette: 0.3, zoom: 1 + 0.012 * press };
  }
}
