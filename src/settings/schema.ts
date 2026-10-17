// Every user setting, its default, and how a saved file is read back. Pure: tests run it on
// broken, old and hand-edited files. The file lives in the app config dir as settings.json.
// Copied from Basesmall's schema; the fields are DesktopLOL's own.

import { DEFAULT_ENDPOINT } from '../data/streamcv/source.ts';

export const SETTINGS_VERSION = 1;

export type Background = 'solid' | 'semi' | 'clear';
export type Language = 'auto' | 'zh-Hant' | 'en';
export type GoldView = 'diff' | 'totals';
export type Size = { w: number; h: number };

/** Each piece of the widget can be turned off on its own. */
export const FEATURES = [
  'clock', 'kills', 'gold',
  'towers', 'nexusTimers', 'inhibitors',
  'dragons', 'soul', 'nextDragon',
  'barons', 'nextBaron', 'buffs',
  'voidgrubs', 'herald',
  'series', 'playerItems',
  'nextMatch', 'tendencies',
] as const;
export type Feature = (typeof FEATURES)[number];

/** Views that open under the game, each on its own. */
export const VIEWS = ['draftGame', 'draftSeries', 'players', 'schedule'] as const;
export type ViewName = (typeof VIEWS)[number];

export interface Settings {
  version: typeof SETTINGS_VERSION;
  language: Language;
  background: Background;
  /** Where the Stream CV service answers. Moves to a VPS later; the fields stay the same. */
  endpoint: string;
  show: Record<Feature, boolean>;
  /** Gold lead as one number, or both teams' totals. */
  gold: GoldView;
  /** Keep the clock and countdowns moving between the service's 5-second updates. */
  tickClock: boolean;
  /** Which views under the game are open. */
  views: Record<ViewName, boolean>;
  /** Hide series scores and winners (many watch the replay the next day). */
  spoilerFree: boolean;
  /** Window sizes per view ('size-game', 'size-settings'). */
  sizes: Record<string, Size>;
}

export const DEFAULTS: Settings = {
  version: SETTINGS_VERSION,
  language: 'auto',
  background: 'solid',
  endpoint: DEFAULT_ENDPOINT,
  // Everything on: the widget is already small, and each piece is one glance.
  show: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>,
  gold: 'diff',
  tickClock: true,
  views: { draftGame: false, draftSeries: false, players: false, schedule: false },
  spoilerFree: true,
  sizes: {},
};

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** An http(s) URL without spaces, at most 300 characters. */
export function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 300 || /\s/.test(v)) return false;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function size(v: unknown): Size | undefined {
  const o = obj(v);
  const w = Number(o.w), h = Number(o.h);
  return Number.isFinite(w) && Number.isFinite(h) && w >= 100 && h >= 20 && w <= 10000 && h <= 10000
    ? { w: Math.round(w), h: Math.round(h) } : undefined;
}

/**
 * Read whatever was saved into a complete, valid Settings. Unknown fields are dropped, bad values
 * fall back to their defaults one by one, so a hand-edited typo never loses the rest of the file.
 */
export function normalize(raw: unknown): Settings {
  const o = obj(raw);
  const d = DEFAULTS;
  const show = obj(o.show), views = obj(o.views);
  const sizes: Record<string, Size> = {};
  for (const [k, v] of Object.entries(obj(o.sizes))) {
    const s = size(v);
    if (s && /^size-[a-z-]+$/.test(k)) sizes[k] = s;
  }
  return {
    version: SETTINGS_VERSION,
    language: oneOf(o.language, ['auto', 'zh-Hant', 'en'], d.language),
    background: oneOf(o.background, ['solid', 'semi', 'clear'], d.background),
    endpoint: validEndpoint(o.endpoint) ? o.endpoint : d.endpoint,
    show: Object.fromEntries(FEATURES.map((f) => [f, bool(show[f], d.show[f])])) as Record<Feature, boolean>,
    gold: oneOf(o.gold, ['diff', 'totals'], d.gold),
    tickClock: bool(o.tickClock, d.tickClock),
    views: Object.fromEntries(VIEWS.map((v) => [v, bool(views[v], d.views[v])])) as Record<ViewName, boolean>,
    spoilerFree: bool(o.spoilerFree, d.spoilerFree),
    sizes,
  };
}
