// The frame this video is laid out in, in logical px (plates read it as W and H from engine/gl.ts):
//   1920x1080  16:9, the default        1080x1920  a vertical reel (9:16)
//   820x1000   the motion card that video-ad-editor-masri shows above the speaker
// A preview or render can override it with ?format=WxH (scripts/render.ts --format WxH), so one project
// can hold plates for several formats: render each plate in its own (--only <id> --format WxH).
export const DEFAULT_FORMAT = { w: 1080, h: 1920 };

/** Parse "1080x1920" (or "reel", "card", "wide"). */
export function parseFormat(s: string | null | undefined): { w: number; h: number } | null {
  if (!s) return null;
  const named: Record<string, { w: number; h: number }> = { wide: { w: 1920, h: 1080 }, reel: { w: 1080, h: 1920 }, card: { w: 820, h: 1000 } };
  if (named[s]) return named[s]!;
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(s);
  return m ? { w: +m[1]!, h: +m[2]! } : null;
}

function readFormat() {
  if (typeof location !== 'undefined') return parseFormat(new URLSearchParams(location.search).get('format')) ?? DEFAULT_FORMAT;
  return DEFAULT_FORMAT;
}

/** The format of this page (default, or ?format=). */
export const FORMAT = readFormat();
