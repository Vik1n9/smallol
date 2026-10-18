import { describe, expect, it } from 'vitest';
import { GAIN, renderTone, type Volume } from '../src/ui/sound.ts';

const RATE = 48_000;
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
/** Frequency from upward zero crossings over a stretch of samples. */
function freq(a: Float32Array, from: number, to: number): number {
  let n = 0, first = -1, last = -1;
  for (let i = Math.round(from * RATE) + 1; i < Math.round(to * RATE); i++) {
    if (a[i - 1]! < 0 && a[i]! >= 0) { n++; if (first < 0) first = i; last = i; }
  }
  return ((n - 1) * RATE) / (last - first);
}

describe('card sound (batch 3 §3)', () => {
  for (const level of ['important', 'major'] as const) {
    for (const v of ['low', 'mid', 'high'] as Volume[]) {
      it(`${level}, ${v}: at most 250 ms, peak within 5% of ${GAIN[v]}, no clipping`, () => {
        const a = renderTone(level, v, RATE);
        expect(a.length / RATE).toBeLessThanOrEqual(0.25);
        expect(Math.abs(peak(a) - GAIN[v]) / GAIN[v]).toBeLessThanOrEqual(0.05);
        expect(peak(a)).toBeLessThan(0.5);
      });
    }
  }

  it('important is one 660 Hz note; major rises 660 → 880 Hz (about 4:3)', () => {
    const imp = renderTone('important', 'mid', RATE);
    expect(freq(imp, 0.005, 0.1)).toBeCloseTo(660, -1);
    const maj = renderTone('major', 'mid', RATE);
    const lo = freq(maj, 0.005, 0.065), hi = freq(maj, 0.095, 0.17);
    expect(lo).toBeCloseTo(660, -1);
    expect(hi).toBeCloseTo(880, -1);
    expect(hi / lo).toBeCloseTo(4 / 3, 2);
  });
});
