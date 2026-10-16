// Champion display names, text only (no portraits: CLAUDE.md rule 7). The table comes from
// Data Dragon via scripts/champion-names.mjs; an id it does not know is shown as it is.

import type { Lang } from '../i18n/index.ts';
import type { Champion } from '../model/types.ts';
import table from './champions.json' with { type: 'json' };

const NAMES = (table as { names: Record<string, Record<Lang, string>> }).names;

export const CHAMPION_SOURCE = (table as { source: string }).source;

export function championName(id: Champion, lang: Lang): string {
  return NAMES[id]?.[lang] ?? id;
}

export const knownChampion = (id: Champion) => id in NAMES;
