import { hexToLinear } from './util';

// The whole video lives in a restrained palette: ink, bone, and one signal colour.
// One rare accent (acid, the shrooms moment) — see docs/TREATMENT.md.
export const HEX = {
  ink: '#090909', // VEXODA dark (a touch below #141414 so panels in #141414 read as raised)
  ink2: '#141414', // brand dark: panels
  graphite: '#3A3D38', // hairlines, dim UI
  ash: '#8E948A', // secondary text
  bone: '#F2F2F2', // brand light: primary text
  signal: '#92C720', // brand lime: the spark, emphasis
  ember: '#C9F45A', // hot lime core
  blood: '#4E6B10', // deep lime (on light paper)
  acid: '#D8FF3C', // rare highlight
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
