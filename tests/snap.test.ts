import { describe, expect, it } from 'vitest';
import { letGo, snap, type Rect, type Target } from '../src/ui/snap.ts';

const AREA: Rect = { x: 0, y: 0, w: 1920, h: 1040 };
const win = (x: number, y: number, w = 300, h = 100): Rect => ({ x, y, w, h });
const other = (x: number, y: number, w = 300, h = 100, visible = true, minimized = false): Target => ({ x, y, w, h, visible, minimized });

describe('edge snapping (batch 3 §5)', () => {
  it('11 and 12 px snap to the work area edge, 13 does not', () => {
    expect(snap(win(11, 500), [], AREA, 1).x).toBe(0);
    expect(snap(win(12, 500), [], AREA, 1).x).toBe(0);
    expect(snap(win(13, 500), [], AREA, 1).x).toBe(13);
    // Right and bottom edges too.
    expect(snap(win(1920 - 300 - 12, 500), [], AREA, 1).x).toBe(1620);
    expect(snap(win(500, 1040 - 100 - 7), [], AREA, 1).y).toBe(940);
  });

  it('the distance is logical: 12 × scale in physical pixels', () => {
    const area150: Rect = { x: 0, y: 0, w: 2880, h: 1560 };
    expect(snap(win(18, 500), [], area150, 1.5).x).toBe(0);
    expect(snap(win(19, 500), [], area150, 1.5).x).toBe(19);
    const area200: Rect = { x: 0, y: 0, w: 3840, h: 2080 };
    expect(snap(win(24, 500), [], area200, 2).x).toBe(0);
    expect(snap(win(25, 500), [], area200, 2).x).toBe(25);
  });

  it('beside another window with a 6 px gap; same edges line up with no gap', () => {
    const o = other(500, 300);
    // Right of it: left edge at 800 + 6.
    expect(snap(win(812, 310), [o], AREA, 1).x).toBe(806);
    // Below it: top at 400 + 6.
    expect(snap(win(505, 410), [o], AREA, 1)).toMatchObject({ x: 500, y: 406 });
    // At 150%, the gap is 9 physical pixels.
    const area150: Rect = { x: 0, y: 0, w: 2880, h: 1560 };
    expect(snap(win(812, 310), [o], area150, 1.5).x).toBe(809);
  });

  it('a pause of 150 ms or more with the button still down is not a let-go; the button up is (C1)', () => {
    expect(letGo(100, false)).toBe('wait');
    expect(letGo(150, true)).toBe('recheck');
    expect(letGo(400, true)).toBe('recheck');
    expect(letGo(150, false)).toBe('snap');
  });

  it('Alt held, or the bar expanded: no snapping', () => {
    expect(snap(win(5, 500), [], AREA, 1, { alt: true }).x).toBe(5);
    expect(snap(win(5, 500), [], AREA, 1, { expanded: true }).x).toBe(5);
  });

  it('the nearest candidate wins', () => {
    // 3 px from the area edge, 5 px from lining up with a window's left edge at 8.
    const o = other(8, 600);
    expect(snap(win(3, 495), [o], AREA, 1).x).toBe(0);
    expect(snap(win(6, 495), [o], AREA, 1).x).toBe(8);
  });

  it('hidden and minimized windows are not targets; far windows are not either', () => {
    expect(snap(win(812, 310), [other(500, 300, 300, 100, false)], AREA, 1).x).toBe(812);
    expect(snap(win(812, 310), [other(500, 300, 300, 100, true, true)], AREA, 1).x).toBe(812);
    // 600 px below: not lined up with.
    expect(snap(win(812, 1000 - 100), [other(500, 300)], AREA, 1).x).toBe(812);
  });

  it('only the bar screen\'s work area: the edge shared with a second screen does not hold a window', () => {
    // Second screen to the right (x 1920+); a window on it 5 px past the shared edge stays put.
    expect(snap(win(1925, 500), [], AREA, 1).x).toBe(1925);
    // And a window on the first screen is not pushed off it to line up with one on the second.
    expect(snap(win(1610, 500), [other(1930, 500)], AREA, 1).x).toBe(1620);
  });
});
