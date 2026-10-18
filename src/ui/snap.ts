// Edge snapping (docs/UI_SPEC_batch3.md §5): a window let go within 12 px of the screen's work area or
// of another of the app's windows lines up with it. Pure: rectangles in (physical pixels), rectangle
// out; the main window calls it 150 ms after the last move event.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Target extends Rect { visible: boolean; minimized: boolean }

/**
 * When a moved window counts as let go: no move for 150 ms and the left button up. A pause mid-drag with
 * the button still down is not a let-go (snapping inside the system's drag loop made the window jump);
 * look again every 50 ms until the button is up (batch 3 review, C1).
 */
export const LET_GO_MS = 150, RECHECK_MS = 50;
export function letGo(sinceMove: number, buttonDown: boolean): 'wait' | 'recheck' | 'snap' {
  if (sinceMove < LET_GO_MS) return 'wait';
  return buttonDown ? 'recheck' : 'snap';
}

/** Logical pixels: how near counts, and the gap between two windows side by side (as the notices stack). */
export const SNAP_PX = 12;
export const GAP_PX = 6;

/**
 * Where `r` ends up. `area` is the work area of the screen the bar is on (taskbar left out); `others` the
 * app's other windows (hidden and minimized ones are not targets). Each axis takes its nearest
 * candidate within the distance; Alt held, or the bar's history or menu open, means no snapping.
 */
export function snap(r: Rect, others: readonly Target[], area: Rect, scale: number, opts: { alt?: boolean; expanded?: boolean } = {}): Rect {
  if (opts.alt || opts.expanded) return r;
  const near = SNAP_PX * scale, gap = Math.round(GAP_PX * scale);
  const xs: number[] = [area.x, area.x + area.w - r.w];
  const ys: number[] = [area.y, area.y + area.h - r.h];
  for (const o of others) {
    if (!o.visible || o.minimized) continue;
    // Only windows close enough on the other axis: a window far below is not something to line up with.
    const vClose = r.y < o.y + o.h + gap + near && o.y < r.y + r.h + gap + near;
    const hClose = r.x < o.x + o.w + gap + near && o.x < r.x + r.w + gap + near;
    if (vClose) xs.push(o.x + o.w + gap, o.x - gap - r.w, o.x, o.x + o.w - r.w);
    if (hClose) ys.push(o.y + o.h + gap, o.y - gap - r.h, o.y, o.y + o.h - r.h);
  }
  const pick = (v: number, cands: number[]) => {
    let best = v, d = Infinity;
    for (const c of cands) { const e = Math.abs(c - v); if (e <= near && e < d) { d = e; best = c; } }
    return best;
  };
  // Snapped only inside its own screen: a candidate that would push it off the work area is not taken.
  const inside = (c: number, lo: number, hi: number) => c >= lo && c <= hi;
  const x = pick(r.x, xs.filter((c) => inside(c, area.x, area.x + area.w - r.w)));
  const y = pick(r.y, ys.filter((c) => inside(c, area.y, area.y + area.h - r.h)));
  return { ...r, x, y };
}
