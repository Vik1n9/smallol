// Dragon marks: one plain shape and colour per element, so they read without colour too.
// No Riot art (CLAUDE.md rule 7). Pure: element in, inline SVG out.

import type { Element } from '../model/types.ts';

export const ELEMENT_COLOUR: Record<Element | 'elder', string> = {
  infernal: '#E8643C', ocean: '#3FA2E0', mountain: '#B98A55', cloud: '#BFD3E6',
  hextech: '#46CBC8', chemtech: '#8FCB45', elder: '#C7A4F2',
};

/** Shape inside a 10x10 box, centred at 5,5. */
const SHAPE: Record<Element | 'elder', string> = {
  // flame: a point up
  infernal: '<path d="M5 0.8 L9.2 9 L0.8 9 Z"/>',
  // drop: a circle
  ocean: '<circle cx="5" cy="5" r="4.1"/>',
  // rock: a square
  mountain: '<rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.8"/>',
  // wind: a diamond
  cloud: '<path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z"/>',
  hextech: '<path d="M5 0.6 L8.8 2.8 L8.8 7.2 L5 9.4 L1.2 7.2 L1.2 2.8 Z"/>',
  // chemtech: a point down
  chemtech: '<path d="M0.8 1 L9.2 1 L5 9.2 Z"/>',
  elder: '<path d="M5 0.4 L6.3 3.6 L9.6 3.8 L7 6 L7.9 9.4 L5 7.5 L2.1 9.4 L3 6 L0.4 3.8 L3.7 3.6 Z"/>',
};

export function dragonMark(el: Element | 'elder', size: number, title?: string, cls = ''): string {
  return `<svg class="drake ${cls}" width="${size}" height="${size}" viewBox="0 0 10 10" fill="${ELEMENT_COLOUR[el]}" aria-hidden="${title ? 'false' : 'true'}">${
    title ? `<title>${title}</title>` : ''}${SHAPE[el]}</svg>`;
}

/** An empty slot, for the drakes still needed for a soul. */
export function emptySlot(size: number): string {
  return `<svg class="drake slot" width="${size}" height="${size}" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="2" fill="var(--muted)" fill-opacity="0.35"/></svg>`;
}
