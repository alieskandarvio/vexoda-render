// The edit: which plate plays when. A voiceover has no beat grid, so every cut sits in the pause
// before a line, anchored to the aligned script (data/lyrics.json): when the voiceover is re-recorded
// and re-aligned, every cut (and every animation keyed to a word) re-times itself.
//
// One row per plate, in order: [id, scene file in src/scenes (without .ts), text from the line the plate
// starts on (null = the start of the video), optional extras (params, post, caption, maxSamples)].
// A plate ends where the next one starts; the last one ends with the audio.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

type Row = [id: string, file: string, from: string | [string, number] | null, extra?: Partial<TimelineEntry>];

const PLATES: Row[] = [
  ['daily', 'daily', null],                     // «تحليل اليوم» — the bot's morning analysis as a daily reel (trial)
];

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut in the pause before the line containing q: 0.18 s before its first word (less if the pause is short). */
  const cut = (from: string | [string, number]) => {
    const [q, nth] = typeof from === 'string' ? [from, 0] : from;
    const l = ly.get(q, nth);
    const prev = ly.lines[l.i - 1];
    const gap = prev ? l.start - prev.end : 1;
    return Math.max(0, l.start - Math.min(0.18, Math.max(0.04, gap * 0.45)));
  };
  const starts = PLATES.map(([, , from]) => (from ? cut(from) : 0));
  return PLATES.map(([id, file, , extra], i) =>
    // `file` lets the preview hot-reload every entry that uses an edited scene module
    Object.assign({ id, load: scene(file), start: starts[i]!, end: starts[i + 1] ?? au.duration, ...extra }, { file }));
}
