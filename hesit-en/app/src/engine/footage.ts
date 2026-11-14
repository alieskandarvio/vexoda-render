// Live-action footage for the plates: numbered JPEG frames (public/foot/<clip>/00000.jpg …, made by
// footage/prep.py) streamed into textures, graded, keyed and composited by one fullscreen pass.
//  - Clip: a frame sequence (fps, count, size) and, for screens, a per-frame corner track (track.py). Frames
//    are fetched ahead of render by Scene.prepare() (the engine awaits it before every exported frame), so
//    render() itself stays synchronous and deterministic.
//  - Shot: a clip placed on the video's clock (in-point, speed), with an optional screen to fill.
//  - FootPass: draws a shot into a render target: a view transform (cover fit, pan, zoom, rotation, in logical
//    px), a grade (exposure, contrast, saturation, warmth, lift), a rounded-rect window, and a screen
//    replacement: the tracked quad (green key or a plain quad) filled by a texture through a homography.
import * as THREE from 'three';
import { FSPass, W, H } from './gl';
import { clamp } from './util';

/** t0: source seconds of frame 0 (prep.py may extract only the used range; plates always speak source time). */
export interface ClipInfo { id: string; fps: number; n: number; w: number; h: number; t0?: number; ext?: string; alpha?: boolean }
/** Normalised (0..1, y down) screen corners at source time t (s): [tl, tr, br, bl] as [x, y] pairs. */
export type Track = { t: number; q: [number, number][] }[];

const MANIFEST: Promise<Record<string, ClipInfo>> = typeof fetch !== 'undefined'
  ? fetch('foot/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  : Promise.resolve({});

export class Clip {
  info!: ClipInfo;
  track: Track | null = null;
  private tex = new Map<number, THREE.Texture>();
  /** matte clips (info.alpha): the alpha frame aNNNNN.jpg of each colour frame (the decontaminated foreground). */
  private atex = new Map<number, THREE.Texture>();
  private loading = new Map<number, Promise<void>>();
  constructor(public id: string) {}
  async init() {
    const m = await MANIFEST;
    const info = m[this.id];
    if (!info) throw new Error(`footage clip not in foot/manifest.json: ${this.id}`);
    this.info = info;
    try {
      const r = await fetch(`foot/${this.id}/track.json`);
      if (r.ok) this.track = await r.json();
    } catch { /* no track */ }
    return this;
  }
  get dur() { return this.info.n / this.info.fps; }
  /** Frame position (fractional, in the extracted sequence) at source time lt (seconds). */
  pos(lt: number) { return clamp((lt - (this.info.t0 ?? 0)) * this.info.fps, 0, this.info.n - 1); }
  private url(i: number, a = false) { return `foot/${this.id}/${a ? 'a' : ''}${String(i).padStart(5, '0')}.${this.info.ext ?? 'jpg'}`; }
  private static async texOf(url: string) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`footage frame missing: ${url}`);
    const bmp = await createImageBitmap(await r.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const t = new THREE.Texture(bmp as any);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
  private load(i: number) {
    i = Math.round(clamp(i, 0, this.info.n - 1));
    if (this.tex.has(i)) return Promise.resolve();
    let p = this.loading.get(i);
    if (!p) {
      p = (async () => {
        const [t, a] = await Promise.all([Clip.texOf(this.url(i)), this.info.alpha ? Clip.texOf(this.url(i, true)) : Promise.resolve(null)]);
        if (a) { a.colorSpace = THREE.NoColorSpace; this.atex.set(i, a); }
        this.tex.set(i, t);
        this.loading.delete(i);
      })();
      this.loading.set(i, p);
    }
    return p;
  }
  /** Make sure the frames for clip-local times [lt0, lt1] are loaded; drop frames far from them. */
  async need(lt0: number, lt1: number) {
    const a = Math.floor(this.pos(Math.min(lt0, lt1))), b = Math.ceil(this.pos(Math.max(lt0, lt1)));
    const want: number[] = [];
    for (let i = a; i <= b; i++) want.push(i);
    await Promise.all(want.map((i) => this.load(i)));
    for (const [i, t] of this.tex) if (i < a - 3 || i > b + 6) {
      (t.image as ImageBitmap)?.close?.(); t.dispose(); this.tex.delete(i);
      const m = this.atex.get(i); if (m) { (m.image as ImageBitmap)?.close?.(); m.dispose(); this.atex.delete(i); }
    }
  }
  /** Load several clip-local ranges at once; evict only frames outside all of them. */
  async needRanges(rs: [number, number][]) {
    const spans = rs.map(([a, b]) => [Math.floor(this.pos(Math.min(a, b))), Math.ceil(this.pos(Math.max(a, b)))] as [number, number]);
    const want: number[] = [];
    for (const [a, b] of spans) for (let i = a; i <= b; i++) want.push(i);
    await Promise.all(want.map((i) => this.load(i)));
    const keep = (i: number) => spans.some(([a, b]) => i >= a - 3 && i <= b + 6);
    for (const [i, t] of this.tex) if (!keep(i)) {
      (t.image as ImageBitmap)?.close?.(); t.dispose(); this.tex.delete(i);
      const m = this.atex.get(i); if (m) { (m.image as ImageBitmap)?.close?.(); m.dispose(); this.atex.delete(i); }
    }
  }
  /** Textures of the two frames around clip-local time lt and the mix between them (blend for non-integer cadences). */
  frames(lt: number, blend: boolean): [THREE.Texture | null, THREE.Texture | null, number] {
    const p = this.pos(lt);
    const i0 = Math.floor(p), i1 = Math.min(this.info.n - 1, i0 + 1);
    const f = blend ? p - i0 : 0;
    const near = (i: number) => this.tex.get(i) ?? this.closest(i);
    return [near(i0), f > 0.001 ? near(i1) : null, f];
  }
  /** The alpha (matte) texture of the frame shown at clip-local time lt (nearest frame). */
  alphaAt(lt: number): THREE.Texture | null {
    if (!this.info.alpha) return null;
    const i = Math.round(this.pos(lt));
    let best = this.atex.get(i) ?? null, bd = best ? 0 : 1e9;
    if (!best) for (const [j, t] of this.atex) if (Math.abs(j - i) < bd) { bd = Math.abs(j - i); best = t; }
    return best;
  }
  private closest(i: number) {
    let best: THREE.Texture | null = null, bd = 1e9;
    for (const [j, t] of this.tex) if (Math.abs(j - i) < bd) { bd = Math.abs(j - i); best = t; }
    return best;
  }
  /** Screen corners (normalised, y down) at source time lt, interpolated between tracked samples. */
  quad(lt: number): [number, number][] | null {
    const tr = this.track;
    if (!tr || !tr.length) return null;
    let k = 0;
    while (k < tr.length - 1 && tr[k + 1]!.t <= lt) k++;
    const A = tr[k]!, Bq = tr[Math.min(tr.length - 1, k + 1)]!;
    const u = Bq.t > A.t ? clamp((lt - A.t) / (Bq.t - A.t)) : 0;
    return A.q.map((c, j) => [c[0] + (Bq.q[j]![0] - c[0]) * u, c[1] + (Bq.q[j]![1] - c[1]) * u]) as [number, number][];
  }
}

const CLIPS = new Map<string, Promise<Clip>>();
export function clip(id: string) {
  let p = CLIPS.get(id);
  if (!p) { p = new Clip(id).init(); CLIPS.set(id, p); }
  return p;
}

/** A clip on the video clock: video time t shows clip-local time in + (t - at) * speed. */
export class Shot {
  constructor(public c: Clip, public at: number, public inPt = 0, public speed = 1) {}
  lt(t: number) { return this.inPt + (t - this.at) * this.speed; }
  /** Blend adjacent source frames when the cadence does not divide 60 (24/25 fps), not for 30/60. */
  get blend() { return 60 % Math.round(this.c.info.fps) !== 0; }
  need(t0: number, t1: number) { return this.c.need(this.lt(t0), this.lt(t1)); }
}

export interface Grade {
  exposure?: number; // stops
  contrast?: number; // 1 = none (pivot at mid grey)
  sat?: number; // 1 = none
  warm?: number; // -1..1 (blue ↔ amber)
  tint?: number; // -1..1 (green ↔ magenta)
  lift?: number; // black level (sRGB units, + raises, - crushes)
  gamma?: number; // midtones (1 = none)
  /** Pull the image toward the brand ink in the shadows (0..1). */
  inkShadows?: number;
}
export interface View {
  /** Frame centre of the clip in logical px and its scale (1 = cover fit). */
  x?: number; y?: number; s?: number; rot?: number;
  /** Focus point inside the source (0..1, y down) placed at x, y — for push-ins on a subject. */
  fx?: number; fy?: number;
  /** Mirror horizontally. */
  flip?: boolean;
  /** Allow the frame to show past the source's edges (picture-in-picture, whips). */
  free?: boolean | number;
}
export interface Window { x: number; y: number; w: number; h: number; r?: number; feather?: number }
/** The tile break-up of a shot: k 0 → 1.6 (tiles leave staggered from the centre outward), tile size in px. */
export interface Shatter { k: number; cx?: number; cy?: number; tile?: number; spread?: number; edge?: number }
export interface ScreenFill {
  tex: THREE.Texture;
  /** 'key': chroma-keyed green inside the tracked quad; 'white': a lit white screen keyed by brightness; 'quad': the quad itself. */
  mode?: 'key' | 'white' | 'quad';
  /** Brightness of the inserted image (screens are emissive) and how much of the footage's own light rides over it. */
  gain?: number; sheen?: number;
  /** Override the tracked corners (normalised source coords, y down). */
  quad?: [number, number][];
  /** UV inset of the content inside the quad (bezel-free phones keep 0). */
  opacity?: number;
}

const FRAG = /* glsl */ `
uniform sampler2D f0; uniform sampler2D f1; uniform float fmix;
uniform mat3 view;           // logical frame px -> source uv (0..1, y down)
uniform vec2 srcPx;          // source size in px
uniform float uExp, uCon, uSat, uWarm, uTint, uLift, uGam, uInkSh, uOpacity;
uniform vec4 win; uniform float winR, winF; uniform bool useWin;
uniform bool scr; uniform int scrMode; uniform sampler2D scrTex; uniform mat3 hom; uniform float scrGain, scrSheen, scrOp;
uniform vec2 frame;
uniform sampler2D ma; uniform bool useMatte; uniform bool matteInv; uniform float matteChoke;
uniform float uShat; uniform vec2 uShatC; uniform float uTile; uniform float uShatSpread; uniform vec3 uEdgeCol; uniform float uEdge;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 toS(vec3 x) { return pow(max(x, 0.0), vec3(1.0 / 2.2)); }
vec3 toL(vec3 x) { return pow(max(x, 0.0), vec3(2.2)); }
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * frame;          // logical px, y down
  // ---- shatter: the frame breaks into tiles that shrink away (staggered outward from uShatC)
  float shA = 1.0, shEdge = 0.0;
  if (uShat > 0.0) {
    vec2 id = floor(px / uTile), c = (id + 0.5) * uTile;
    float far = length(frame);
    float dl = length(c - uShatC) / far * uShatSpread + h21(id) * 0.22;
    float k = clamp((uShat - dl) / 0.42, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    float sc = max(1.0 - k, 1e-3);
    vec2 drift = normalize(c - uShatC + 1e-3) * uTile * 0.35 * k + vec2(0.0, uTile * 0.6 * k * k);
    vec2 q = (px - c - drift) / sc;
    float inT = step(max(abs(q.x), abs(q.y)), uTile * 0.5);
    shA = inT * (1.0 - smoothstep(0.85, 1.0, k));
    float e = uTile * 0.5 - max(abs(q.x), abs(q.y));
    shEdge = inT * (1.0 - smoothstep(0.0, 3.0 / sc, e)) * smoothstep(0.0, 0.08, k) * (1.0 - k);
    px = c + q;
  }
  vec3 uvh = view * vec3(px, 1.0);
  vec2 uv = uvh.xy;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec3 c = texture(f0, tuv).rgb;
  if (fmix > 0.0) c = mix(c, texture(f1, tuv).rgb, fmix);
  float alpha = inside * shA;
  if (useMatte) {
    float m = texture(ma, tuv).r;
    m = clamp((m - matteChoke) / max(1.0 - matteChoke, 1e-3), 0.0, 1.0);
    alpha *= matteInv ? 1.0 - m : m;
  }
  // ---- screen replacement (before the grade: the inserted screen is graded with the shot, lightly)
  if (scr) {
    vec3 q = hom * vec3(uv, 1.0);
    vec2 s = q.xy / q.z;                                  // 0..1 inside the screen quad (y down)
    float inQ = step(-0.04, s.x) * step(s.x, 1.04) * step(-0.04, s.y) * step(s.y, 1.04);
    vec3 cs = toS(c);
    float m;
    if (scrMode == 0) {
      // green key: how much greener than the other channels, soft edges
      float gk = cs.g - max(cs.r, cs.b);
      m = smoothstep(0.06, 0.20, gk) * inQ;
      // spill on fingers and bezel edges inside the quad's neighbourhood
      float spill = max(0.0, cs.g - max(cs.r, cs.b) * 1.02);
      cs.g -= spill * inQ * (1.0 - m);
      c = toL(cs);
    } else if (scrMode == 2) {
      // a lit white screen: bright and colourless (the notch and the bezel stay)
      float mn = min(cs.r, min(cs.g, cs.b)), mx = max(cs.r, max(cs.g, cs.b));
      m = smoothstep(0.55, 0.78, mn) * (1.0 - smoothstep(0.12, 0.25, mx - mn)) * inQ;
    } else {
      vec2 e = min(s, 1.0 - s);
      float px1 = 1.5 / max(srcPx.x, 1.0);
      m = smoothstep(0.0, px1 * 2.0, min(e.x, e.y));
    }
    m *= scrOp;
    vec3 ui = texture(scrTex, vec2(clamp(s.x, 0.0, 1.0), 1.0 - clamp(s.y, 0.0, 1.0))).rgb * scrGain;
    // the screen's glass keeps a trace of the room's light
    float lum = dot(toS(texture(f0, tuv).rgb), vec3(0.3, 0.5, 0.2));
    ui += vec3(scrSheen) * smoothstep(0.55, 0.95, lum) * 0.0;
    c = mix(c, ui, m);
  }
  // ---- grade (in display space)
  vec3 g = toS(c * exp2(uExp));
  g = (g - 0.5) * uCon + 0.5;
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, uSat);
  g += vec3(uWarm * 0.06, uTint * -0.04, -uWarm * 0.06);
  g = pow(max(g, 0.0), vec3(1.0 / uGam));
  g = g + uLift * (1.0 - g);
  // shadows toward the brand ink (neutral, slightly cool-green black)
  float sh = 1.0 - smoothstep(0.0, 0.45, l);
  g = mix(g, g * vec3(0.92, 0.97, 0.93), uInkSh * sh);
  c = toL(clamp(g, 0.0, 4.0));
  if (useWin) {
    vec2 ctr = win.xy + win.zw * 0.5;
    float d = sdRR(px - ctr, win.zw * 0.5, winR);
    alpha *= 1.0 - smoothstep(-winF, 0.0, d);
  }
  alpha *= uOpacity;
  c += uEdgeCol * shEdge * uEdge;
  fragColor = vec4(c * alpha, alpha);
}`;

/** 3x3 homography taking 4 points (p) to the unit square corners [tl, tr, br, bl]. */
export function quadToUnit(p: [number, number][]): THREE.Matrix3 {
  // square -> quad (Heckbert), then invert
  const [x0, y0] = p[0]!, [x1, y1] = p[1]!, [x2, y2] = p[2]!, [x3, y3] = p[3]!;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // maps (u, v) of the unit square (u along tl→tr, v along tl→bl) to the quad
  const m = new THREE.Matrix3().set(a, b, c, d, e, f, g, h, 1);
  return m.invert();
}

export class FootPass {
  pass = new FSPass(FRAG, {
    f0: { value: null }, f1: { value: null }, fmix: { value: 0 },
    view: { value: new THREE.Matrix3() }, srcPx: { value: new THREE.Vector2(1, 1) },
    uExp: { value: 0 }, uCon: { value: 1 }, uSat: { value: 1 }, uWarm: { value: 0 }, uTint: { value: 0 }, uLift: { value: 0 }, uGam: { value: 1 }, uInkSh: { value: 0 }, uOpacity: { value: 1 },
    win: { value: new THREE.Vector4(0, 0, W, H) }, winR: { value: 0 }, winF: { value: 1 }, useWin: { value: false },
    scr: { value: false }, scrMode: { value: 0 }, scrTex: { value: null }, hom: { value: new THREE.Matrix3() }, scrGain: { value: 1 }, scrSheen: { value: 0 }, scrOp: { value: 1 },
    frame: { value: new THREE.Vector2(W, H) },
    ma: { value: null }, useMatte: { value: false }, matteInv: { value: false }, matteChoke: { value: 0 },
    uShat: { value: 0 }, uShatC: { value: new THREE.Vector2(W / 2, H / 2) }, uTile: { value: 90 }, uShatSpread: { value: 0.8 },
    uEdgeCol: { value: new THREE.Vector3(0.29, 0.56, 0.015) }, uEdge: { value: 0 },
  }, { blending: THREE.CustomBlending, transparent: true });
  constructor() {
    const m = this.pass.mat;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  /**
   * Draw `shot` at video time t over `out` (premultiplied over). Returns the frame-px position of a source
   * point mapper so plates can pin graphics to the footage (e.g. a label on the screen's corner).
   */
  draw(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, shot: Shot, t: number, o: { view?: View; grade?: Grade; win?: Window; screen?: ScreenFill; opacity?: number; matte?: 'fg' | 'bg' | null; choke?: number; shatter?: Shatter } = {}) {
    const u = this.pass.u, c = shot.c, info = c.info, lt = shot.lt(t);
    const [a, b, mix] = c.frames(lt, shot.blend);
    if (!a) return null;
    u.f0!.value = a; u.f1!.value = b ?? a; u.fmix!.value = b ? mix : 0;
    const M = this.viewMatrix(info.w, info.h, o.view ?? {});
    (u.view!.value as THREE.Matrix3).copy(M);
    (u.srcPx!.value as THREE.Vector2).set(info.w, info.h);
    const g = o.grade ?? {};
    u.uExp!.value = g.exposure ?? 0; u.uCon!.value = g.contrast ?? 1; u.uSat!.value = g.sat ?? 1;
    u.uWarm!.value = g.warm ?? 0; u.uTint!.value = g.tint ?? 0; u.uLift!.value = g.lift ?? 0; u.uGam!.value = g.gamma ?? 1; u.uInkSh!.value = g.inkShadows ?? 0;
    u.uOpacity!.value = o.opacity ?? 1;
    const ma = o.matte ? c.alphaAt(lt) : null;
    u.useMatte!.value = !!ma; u.ma!.value = ma; u.matteInv!.value = o.matte === 'bg'; u.matteChoke!.value = o.choke ?? 0;
    const sh = o.shatter;
    u.uShat!.value = sh ? sh.k : 0;
    if (sh) {
      (u.uShatC!.value as THREE.Vector2).set(sh.cx ?? W / 2, sh.cy ?? H / 2);
      u.uTile!.value = sh.tile ?? 90; u.uShatSpread!.value = sh.spread ?? 0.8; u.uEdge!.value = sh.edge ?? 0;
    }
    if (o.win) {
      u.useWin!.value = true;
      (u.win!.value as THREE.Vector4).set(o.win.x, o.win.y, o.win.w, o.win.h);
      u.winR!.value = o.win.r ?? 0; u.winF!.value = o.win.feather ?? 1;
    } else u.useWin!.value = false;
    const s = o.screen;
    const q = s ? s.quad ?? c.quad(lt) : null;
    if (s && q) {
      u.scr!.value = true; u.scrMode!.value = s.mode === 'quad' ? 1 : s.mode === 'white' ? 2 : 0; u.scrTex!.value = s.tex;
      (u.hom!.value as THREE.Matrix3).copy(quadToUnit(q));
      u.scrGain!.value = s.gain ?? 1; u.scrSheen!.value = s.sheen ?? 0; u.scrOp!.value = s.opacity ?? 1;
    } else u.scr!.value = false;
    this.pass.render(r, out);
    const Minv = M.clone().invert();
    /** frame px of a source point (normalised, y down) */
    return (sx: number, sy: number): [number, number] => {
      const v = new THREE.Vector3(sx, sy, 1).applyMatrix3(Minv);
      return [v.x / v.z, v.y / v.z];
    };
  }
  /** frame px -> source uv for a cover fit of a (w x h) source, scaled by s about (x, y), with a focus point and rotation. */
  viewMatrix(sw: number, sh: number, v: View) {
    const cover = Math.max(W / sw, H / sh); // px of frame per source px at s = 1
    const s = cover * (v.s ?? 1);
    const fx = v.fx ?? 0.5, fy = v.fy ?? 0.5;
    const x = v.x ?? W / 2, y = v.y ?? H / 2, rot = v.rot ?? 0;
    const cs = Math.cos(-rot), sn = Math.sin(-rot);
    // frame px -> (minus centre) -> rotate back -> /s -> source px about the focus point -> uv
    const T1 = new THREE.Matrix3().set(1, 0, -x, 0, 1, -y, 0, 0, 1);
    const R = new THREE.Matrix3().set(cs, -sn, 0, sn, cs, 0, 0, 0, 1);
    const S = new THREE.Matrix3().set((v.flip ? -1 : 1) / (s * sw), 0, 0, 0, 1 / (s * sh), 0, 0, 0, 1);
    const T2 = new THREE.Matrix3().set(1, 0, fx, 0, 1, fy, 0, 0, 1);
    return T2.multiply(S).multiply(R).multiply(T1);
  }
}
