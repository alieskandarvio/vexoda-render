// Her video, finished: the frame as shot (clip 'src'), Robust Video Matting's cut-out (clip 'fg': decontaminated colour
// + alpha) and a portrait-lens background built from them — all in one place so every plate gets the same look.
//  1. BG_PREP  the room with her removed (premultiplied by 1 − alpha), at quarter resolution, in the shot's framing
//  2. BLUR     separable gaussian on that (twice): a normalised convolution, so her silhouette never bleeds into the room
//  3. COMP     room (sharp ↔ lens-blurred by `bgBlur`, its own grade: darker, cooler, less saturated) + her (graded,
//              sharpened a touch against the push-ins), keyed by the matte. Modes: 'full' | 'bg' (the room only — draw
//              graphics on it, then 'fg') | 'fg' (her only, premultiplied over whatever is there).
import * as THREE from 'three';
import { FSPass, W, H, makeRT } from './gl';
import { clip, Shot, type Clip, type View } from './footage';
import { clamp } from './util';

export interface Look {
  // her
  exposure?: number; contrast?: number; sat?: number; warm?: number; tint?: number; lift?: number; gamma?: number; sharpen?: number;
  // the room behind her
  bgBlur?: number;       // 0 = as shot … 1 = full lens blur
  bgDim?: number;        // stops down
  bgSat?: number;        // saturation (1 = as is)
  bgCool?: number;       // 0..1 toward the brand's graphite-teal
  bgInk?: number;        // 0..1 toward flat ink (a stage for graphics)
  choke?: number;        // matte choke (0..0.5)
}
export const LOOK: Look = { exposure: 0.04, contrast: 1.08, sat: 0.97, warm: -0.035, tint: 0.0, lift: -0.008, gamma: 1.0, sharpen: 0.35,
  bgBlur: 0.92, bgDim: 0.62, bgSat: 0.62, bgCool: 0.32, bgInk: 0, choke: 0.04 };

const VIEW_GLSL = /* glsl */ `
uniform mat3 view; uniform vec2 frame;
vec2 pxOf(vec2 uv) { return vec2(uv.x, 1.0 - uv.y) * frame; }
vec2 srcUv(vec2 px) { vec3 q = view * vec3(px, 1.0); return q.xy; }           // 0..1, y down
vec2 tUv(vec2 s) { return vec2(s.x, 1.0 - s.y); }                                 // texture uv (frames uploaded flipY)
float inside(vec2 s) { return step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0); }`;

const BG_PREP = /* glsl */ `
uniform sampler2D f0; uniform sampler2D ma; uniform float choke;
${VIEW_GLSL}
void main() {
  vec2 s = srcUv(pxOf(vUv));
  vec2 cs = clamp(s, vec2(0.0), vec2(1.0));
  vec3 c = texture(f0, tUv(cs)).rgb;
  float m = texture(ma, tUv(cs)).r;
  // widen the hole a little (hair edges keep a fringe of the room otherwise)
  float k = 1.0 - clamp((m - 0.02) / 0.35, 0.0, 1.0);
  fragColor = vec4(c * k, k);
}`;

const BLUR = /* glsl */ `
uniform sampler2D src; uniform vec2 dir; uniform vec2 texel;
void main() {
  // 13-tap gaussian (sigma ~ 4 texels) along dir
  float w[7]; w[0] = 0.1585; w[1] = 0.1465; w[2] = 0.1156; w[3] = 0.0779; w[4] = 0.0448; w[5] = 0.0220; w[6] = 0.0092;
  vec4 acc = texture(src, vUv) * w[0];
  for (int i = 1; i < 7; i++) {
    vec2 o = dir * texel * float(i) * 2.0;
    acc += (texture(src, vUv + o) + texture(src, vUv - o)) * w[i];
  }
  fragColor = acc / 0.9985;
}`;

const COMP = /* glsl */ `
uniform sampler2D f0; uniform sampler2D fg; uniform sampler2D ma; uniform sampler2D bb; uniform sampler2D bc; uniform bool hasMatte;
uniform vec2 srcPx; uniform float choke; uniform int mode; uniform float opacity;
uniform float uExp, uCon, uSat, uWarm, uTint, uLift, uGam, uSharp;
uniform float bgBlur, bgDim, bgSat, bgCool, bgInk;
uniform vec4 win; uniform float winR, winF; uniform bool useWin; uniform vec4 mbox;
${VIEW_GLSL}
vec3 toS(vec3 x) { return pow(max(x, 0.0), vec3(1.0 / 2.2)); }
vec3 toL(vec3 x) { return pow(max(x, 0.0), vec3(2.2)); }
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 grade(vec3 c, float ex, float con, float sat, float warm, float tint, float lift, float gam) {
  vec3 g = toS(c * exp2(ex));
  g = (g - 0.5) * con + 0.5;
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, sat);
  g += vec3(warm * 0.06, tint * -0.04, -warm * 0.06);
  g = pow(max(g, 0.0), vec3(1.0 / gam));
  g = g + lift * (1.0 - g);
  return toL(clamp(g, 0.0, 4.0));
}
void main() {
  vec2 px = pxOf(vUv);
  vec2 s = srcUv(px);
  float ins = inside(s);
  vec2 cs = clamp(s, vec2(0.0), vec2(1.0));
  vec2 tu = tUv(cs);
  vec3 orig = texture(f0, tu).rgb;
  // a touch of sharpening against the push-ins (unsharp, 4 neighbours one source px away)
  vec2 e = 1.0 / srcPx;
  vec3 nb = (texture(f0, tu + vec2(e.x, 0.0)).rgb + texture(f0, tu - vec2(e.x, 0.0)).rgb + texture(f0, tu + vec2(0.0, e.y)).rgb + texture(f0, tu - vec2(0.0, e.y)).rgb) * 0.25;
  vec3 sharp = max(orig + uSharp * (orig - nb), 0.0);
  float m = 1.0;
  vec3 her = sharp;
  if (hasMatte) {
    m = texture(ma, tu).r;
    m = clamp((m - choke) / max(1.0 - choke, 1e-3), 0.0, 1.0);
    // a box of the source where the matte caught furniture (the chair's arm): no her there
    m *= 1.0 - smoothstep(-0.02, 0.0, min(min(cs.x - mbox.x, mbox.z - cs.x), min(cs.y - mbox.y, mbox.w - cs.y)));
    // the decontaminated colour at the edges, the camera's own inside her
    vec3 fgc = texture(fg, tu).rgb;
    her = mix(fgc, sharp, smoothstep(0.88, 1.0, m));
  }
  her = grade(her, uExp, uCon, uSat, uWarm, uTint, uLift, uGam);
  // the room: sharp ↔ lens blur (normalised: the blurred room without her)
  vec4 b = texture(bb, vUv), bk = texture(bc, vUv);
  vec3 coarse = bk.rgb / max(bk.a, 1e-4);
  vec3 fine = b.rgb / max(b.a, 1e-4);
  vec3 blurred = mix(coarse, fine, smoothstep(0.03, 0.3, b.a));
  // far from any room pixel (deep inside her, both levels empty): a dark neutral
  blurred = mix(vec3(0.02, 0.02, 0.018), blurred, smoothstep(0.002, 0.04, bk.a));
  vec3 room = mix(orig, blurred, bgBlur);
  float rl = dot(toS(room), vec3(0.2126, 0.7152, 0.0722));
  room = grade(room, uExp - bgDim, uCon * 1.02, uSat * bgSat, uWarm - 0.6 * bgCool, uTint + 0.25 * bgCool, uLift, uGam);
  room = mix(room, room * vec3(0.80, 0.95, 0.97), bgCool);              // graphite-teal in the room
  room = mix(room, vec3(0.0055, 0.0055, 0.005) * (0.6 + 0.8 * rl), bgInk); // all the way to ink
  vec3 col; float a;
  if (mode == 1) { col = room; a = 1.0; }
  else if (mode == 2) { col = her * m; a = m; }
  else { col = mix(room, her, m); a = 1.0; }
  if (mode != 2) {
    // outside the source (a pulled-back or free framing): ink, never transparent (the plate owns every pixel)
    col = mix(vec3(0.0042, 0.0042, 0.0038), col, ins) * opacity; a = opacity;
  } else { col *= ins * opacity; a *= ins * opacity; }
  if (useWin) {
    vec2 ctr = win.xy + win.zw * 0.5;
    float d = sdRR(px - ctr, win.zw * 0.5, winR);
    float k = 1.0 - smoothstep(-winF, 0.0, d);
    col *= k; a *= k;
  }
  fragColor = vec4(col, a);
}`;

/** frame px -> source uv for a cover fit of a (w x h) source, scaled by s about (x, y), with a focus point and rotation. */
export function viewMatrix(sw: number, sh: number, v: View, keepCover = true) {
  const cover = Math.max(W / sw, H / sh);
  const s = cover * (v.s ?? 1);
  const fx = v.fx ?? 0.5, fy = v.fy ?? 0.5;
  let x = v.x ?? W / 2, y = v.y ?? H / 2;
  const rot = v.rot ?? 0;
  // never show past the source's edges: the focus point's frame position is clamped so the scaled source covers W×H.
  // `free` (0..1) eases that clamp off CONTINUOUSLY (a boolean switch made the framing jump on the first frame of a
  // pull-back — and a motion-blurred frame straddling the switch showed her twice).
  const fr = typeof v.free === 'number' ? clamp(v.free) : v.free ? 1 : 0;
  if (keepCover && fr < 1) {
    let xc = x, yc = y;
    const L = x - fx * sw * s, T = y - fy * sh * s;
    if (L > 0) xc -= L; else if (L + sw * s < W) xc += W - (L + sw * s);
    if (T > 0) yc -= T; else if (T + sh * s < H) yc += H - (T + sh * s);
    x = xc + (x - xc) * fr; y = yc + (y - yc) * fr;
  }
  const cs = Math.cos(-rot), sn = Math.sin(-rot);
  const T1 = new THREE.Matrix3().set(1, 0, -x, 0, 1, -y, 0, 0, 1);
  const R = new THREE.Matrix3().set(cs, -sn, 0, sn, cs, 0, 0, 0, 1);
  const S = new THREE.Matrix3().set((v.flip ? -1 : 1) / (s * sw), 0, 0, 0, 1 / (s * sh), 0, 0, 0, 1);
  const T2 = new THREE.Matrix3().set(1, 0, fx, 0, 1, fy, 0, 0, 1);
  return T2.multiply(S).multiply(R).multiply(T1);
}

export interface TalkOpts { view?: View; look?: Look; mode?: 'full' | 'bg' | 'fg'; opacity?: number; mbox?: number[]; win?: { x: number; y: number; w: number; h: number; r?: number; feather?: number }; matte?: boolean }

export class TalkPass {
  src!: Clip; fg!: Clip;
  private prep = new FSPass(BG_PREP, { f0: { value: null }, ma: { value: null }, choke: { value: 0 }, view: { value: new THREE.Matrix3() }, frame: { value: new THREE.Vector2(W, H) } });
  private blur = new FSPass(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2(1, 1) } });
  private comp = new FSPass(COMP, {
    f0: { value: null }, fg: { value: null }, ma: { value: null }, bb: { value: null }, bc: { value: null }, hasMatte: { value: false },
    srcPx: { value: new THREE.Vector2(1080, 1920) }, choke: { value: 0 }, mode: { value: 0 }, opacity: { value: 1 },
    uExp: { value: 0 }, uCon: { value: 1 }, uSat: { value: 1 }, uWarm: { value: 0 }, uTint: { value: 0 }, uLift: { value: 0 }, uGam: { value: 1 }, uSharp: { value: 0 },
    bgBlur: { value: 0 }, bgDim: { value: 0 }, bgSat: { value: 1 }, bgCool: { value: 0 }, bgInk: { value: 0 },
    win: { value: new THREE.Vector4(0, 0, W, H) }, winR: { value: 0 }, winF: { value: 1 }, useWin: { value: false }, mbox: { value: new THREE.Vector4(2, 2, 3, 3) },
    view: { value: new THREE.Matrix3() }, frame: { value: new THREE.Vector2(W, H) },
  }, { blending: THREE.CustomBlending, transparent: true });
  private a = makeRT(W / 4, H / 4, { depthBuffer: false });
  private b = makeRT(W / 4, H / 4, { depthBuffer: false });
  private ca = makeRT(W / 16, H / 16, { depthBuffer: false });
  private cb = makeRT(W / 16, H / 16, { depthBuffer: false });
  private copy = new FSPass(`uniform sampler2D src; void main() { fragColor = texture(src, vUv); }`, { src: { value: null } });
  constructor() {
    const m = this.comp.mat;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  async init() { this.src = await clip('src'); this.fg = await clip('fg'); return this; }
  /** Load the frames for source times [s0, s1]. */
  async need(s0: number, s1: number, matte = true) { return this.needRanges([[s0, s1]], matte); }
  async needRanges(rs: [number, number][], matte = true) {
    await Promise.all([this.src.needRanges(rs), matte ? this.fg.needRanges(rs) : Promise.resolve()]);
  }
  /** Draw her at SOURCE time st over `out`. */
  draw(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, st: number, o: TalkOpts = {}) {
    const lk = { ...LOOK, ...(o.look ?? {}) };
    const sh = new Shot(this.src, 0, st, 1), fh = new Shot(this.fg, 0, st, 1);
    const [f0] = this.src.frames(sh.lt(0), false);
    if (!f0) return;
    const matte = o.matte !== false;
    const [fgc] = matte ? this.fg.frames(fh.lt(0), false) : [null];
    const ma = matte ? this.fg.alphaAt(fh.lt(0)) : null;
    const hasM = !!(fgc && ma);
    const M = viewMatrix(1080, 1920, o.view ?? {});
    const mode = o.mode === 'bg' ? 1 : o.mode === 'fg' ? 2 : 0;
    // 1–2: the blurred room (only when it is seen)
    const needBg = hasM && mode !== 2 && (lk.bgBlur ?? 0) > 0.001;
    if (needBg) {
      const p = this.prep.u;
      p.f0!.value = f0; p.ma!.value = ma; (p.view!.value as THREE.Matrix3).copy(M);
      this.prep.render(r, this.a);
      const tx = new THREE.Vector2(1 / this.a.width, 1 / this.a.height);
      const B = this.blur.u;
      for (let it = 0; it < 3; it++) {
        B.src!.value = it === 0 ? this.a.texture : this.a.texture; (B.dir!.value as THREE.Vector2).set(1, 0); (B.texel!.value as THREE.Vector2).copy(tx);
        this.blur.render(r, this.b);
        B.src!.value = this.b.texture; (B.dir!.value as THREE.Vector2).set(0, 1);
        this.blur.render(r, this.a);
      }
      // the coarse level: down to 1/16 and blurred again (it reaches deep under her silhouette)
      this.copy.u.src!.value = this.a.texture; this.copy.render(r, this.ca);
      const tc = new THREE.Vector2(1 / this.ca.width, 1 / this.ca.height);
      for (let it = 0; it < 2; it++) {
        B.src!.value = this.ca.texture; (B.dir!.value as THREE.Vector2).set(1, 0); (B.texel!.value as THREE.Vector2).copy(tc);
        this.blur.render(r, this.cb);
        B.src!.value = this.cb.texture; (B.dir!.value as THREE.Vector2).set(0, 1);
        this.blur.render(r, this.ca);
      }
    }
    const u = this.comp.u;
    u.f0!.value = f0; u.fg!.value = fgc ?? f0; u.ma!.value = ma ?? f0; u.bb!.value = this.a.texture; u.bc!.value = this.ca.texture; u.hasMatte!.value = hasM;
    (u.view!.value as THREE.Matrix3).copy(M);
    u.choke!.value = lk.choke ?? 0; u.mode!.value = hasM ? mode : (mode === 2 ? 0 : mode); u.opacity!.value = o.opacity ?? 1;
    u.uExp!.value = lk.exposure ?? 0; u.uCon!.value = lk.contrast ?? 1; u.uSat!.value = lk.sat ?? 1; u.uWarm!.value = lk.warm ?? 0;
    u.uTint!.value = lk.tint ?? 0; u.uLift!.value = lk.lift ?? 0; u.uGam!.value = lk.gamma ?? 1; u.uSharp!.value = clamp(lk.sharpen ?? 0, 0, 1.5);
    u.bgBlur!.value = needBg ? lk.bgBlur ?? 0 : 0; u.bgDim!.value = lk.bgDim ?? 0; u.bgSat!.value = lk.bgSat ?? 1; u.bgCool!.value = lk.bgCool ?? 0; u.bgInk!.value = lk.bgInk ?? 0;
    const mb = o.mbox ?? (st > 6.71 && st < 14.06 || st > 21.01 && st < 25.22 || st > 28.3 && st < 36.33 || st > 42.24 && st < 54.47 || st > 60.17 && st < 70.16 || st > 74.23 && st < 84.01 || st > 87.42 ? [0.905, 0.56, 1.1, 1.1] : [2, 2, 3, 3]);
    (u.mbox!.value as THREE.Vector4).set(mb[0]!, mb[1]!, mb[2]!, mb[3]!);
    if (o.win) { u.useWin!.value = true; (u.win!.value as THREE.Vector4).set(o.win.x, o.win.y, o.win.w, o.win.h); u.winR!.value = o.win.r ?? 0; u.winF!.value = o.win.feather ?? 1.5; }
    else u.useWin!.value = false;
    this.comp.render(r, out);
  }
  /** Frame px of a source point (normalised, y down) under a view — pin graphics to her (e.g. her head). */
  toFrame(v: View, sx: number, sy: number): [number, number] {
    const Minv = viewMatrix(1080, 1920, v).invert();
    const p = new THREE.Vector3(sx, sy, 1).applyMatrix3(Minv);
    return [p.x / p.z, p.y / p.z];
  }
}
