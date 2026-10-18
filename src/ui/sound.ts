// The card sound (docs/UI_SPEC_batch3.md §3): one note for an important card, two rising notes for a
// major one, so a glance is not needed to tell them apart. Made here, no sound file: the samples are
// computed (pure, so tests measure them) and played through Web Audio in the main window's page (a
// hidden notification window would have its audio throttled).

export type Volume = 'low' | 'mid' | 'high';
/** Peak gain per volume step. */
export const GAIN: Record<Volume, number> = { low: 0.06, mid: 0.12, high: 0.2 };
const ATTACK = 0.005;
/** Each note decays to this fraction of its peak by its end (exponential). */
const FLOOR = 0.001;

export interface Note { f: number; start: number; dur: number }
/** Important: 660 Hz for 140 ms. Major: 660 Hz for 90 ms, then 880 Hz for 120 ms, overlapping by 20 ms. */
export function notes(level: 'major' | 'important'): Note[] {
  return level === 'major' ? [{ f: 660, start: 0, dur: 0.09 }, { f: 880, start: 0.07, dur: 0.12 }] : [{ f: 660, start: 0, dur: 0.14 }];
}

const triangle = (x: number) => 4 * Math.abs(x - Math.floor(x + 0.5)) - 1;

/** The tone as mono samples at `rate`. */
export function renderTone(level: 'major' | 'important', volume: Volume, rate = 48_000): Float32Array<ArrayBuffer> {
  const ns = notes(level);
  const end = Math.max(...ns.map((n) => n.start + n.dur));
  const out = new Float32Array(Math.ceil(end * rate));
  const g = GAIN[volume];
  for (const n of ns) {
    const from = Math.round(n.start * rate), len = Math.round(n.dur * rate);
    for (let i = 0; i < len && from + i < out.length; i++) {
      const t = i / rate;
      const env = t < ATTACK ? t / ATTACK : Math.exp((Math.log(FLOOR) * (t - ATTACK)) / (n.dur - ATTACK));
      out[from + i]! += g * env * triangle(n.f * t);
    }
  }
  return out;
}

let ctx: AudioContext | null = null;
/** Play it now (the main window's page). Quietly nothing where Web Audio is missing. */
export function playTone(level: 'major' | 'important', volume: Volume): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const samples = renderTone(level, volume, ctx.sampleRate);
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  } catch { /* no audio */ }
}
