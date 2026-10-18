// Item display names, text only (no icons: CLAUDE.md rule 7). The table comes from Data Dragon via
// scripts/ddragon-names.mjs; an id it does not know is shown as its number.

import type { Lang } from '../i18n/index.ts';
import table from './items.json' with { type: 'json' };

type Entry = Record<Lang, string> & { minor?: boolean; legendary?: boolean };
const NAMES = (table as { names: Record<string, Entry> }).names;

export function itemName(id: number, lang: Lang): string {
  return NAMES[id]?.[lang] ?? `#${id}`;
}

/** Trinkets, wards and potions. */
export const minorItem = (id: number) => NAMES[id]?.minor === true;

/** A finished legendary item (bought, built from parts, builds into nothing, 2200 gold or more). */
export const legendaryItem = (id: number) => NAMES[id]?.legendary === true;
