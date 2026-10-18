import { describe, expect, it } from 'vitest';
import { AutoLow, detectionMode, type OsState } from '../src/ui/autolow.ts';

const run = (a: AutoLow, states: OsState[], mode: 'work' | 'companion' = 'work', enabled = true) => states.map((s) => (a.step(s, mode, enabled), a.on));

describe('presentation detection (batch 3 §6)', () => {
  it('at work: each full-screen kind turns it on at the first check', () => {
    for (const s of ['busy', 'd3d', 'presentation', 'quiet', 'app'] as const) expect(run(new AutoLow(), [s])).toEqual([true]);
    expect(run(new AutoLow(), ['away'])).toEqual([false]);
  });

  it('turns off only after three clear checks in a row; two and back keeps it on', () => {
    expect(run(new AutoLow(), ['busy', 'ok', 'ok', 'ok'])).toEqual([true, true, true, false]);
    expect(run(new AutoLow(), ['busy', 'ok', 'ok', 'busy', 'ok', 'ok'])).toEqual([true, true, true, true, true, true]);
  });

  it('watching along: busy and d3d do not, presentation and quiet do', () => {
    expect(run(new AutoLow(), ['busy', 'd3d', 'app'], 'companion')).toEqual([false, false, false]);
    expect(run(new AutoLow(), ['presentation'], 'companion')).toEqual([true]);
    expect(run(new AutoLow(), ['quiet'], 'companion')).toEqual([true]);
  });

  it('left by hand: not again while the state lasts; after one clear check, again', () => {
    const a = new AutoLow();
    run(a, ['busy']);
    a.leaveByHand();
    expect(run(a, ['busy', 'busy'])).toEqual([false, false]);
    expect(run(a, ['ok', 'busy'])).toEqual([false, true]);
  });

  it('switched off: never on, and turning it off ends one in progress', () => {
    expect(run(new AutoLow(), ['busy', 'presentation'], 'work', false)).toEqual([false, false]);
    const a = new AutoLow();
    run(a, ['busy']);
    expect(run(a, ['busy'], 'work', false)).toEqual([false]);
  });

  it('custom follows what it started from; the big-events template counts as work', () => {
    expect(detectionMode('custom', 'companion')).toBe('companion');
    expect(detectionMode('custom', 'major')).toBe('work');
    expect(detectionMode('companion', 'work')).toBe('companion');
  });
});
