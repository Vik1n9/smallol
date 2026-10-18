// The log history (docs/UI_SPEC_v1.md §5): every event that reached the log, the last five games,
// grouped by game, filtered by importance or team. Each tower is its own row (no streak merging
// here). Pure: entries in, HTML out; main.ts keeps the list and saves it to log-history.json.

import { TEAM_COLOUR } from '../render/map-svg.ts';
import type { BarStrings } from '../i18n/bar.ts';
import type { Team } from '../model/types.ts';
import type { Level } from './kinds.ts';

export interface LogEntry {
  /** Game id, or the match and game number for draft events (no game id yet). */
  game: string;
  /** Game number in the series, and the two teams (blue, red) for the group's header. */
  n: number | null;
  teams: [string, string];
  /** Game clock, when the event has one. */
  at: number | null;
  text: string;
  level: Level;
  /** The doer's side and code, and the code of the team it happened to. */
  side: Team | null;
  code: string | null;
  victim: string | null;
  /** When it was logged (ms), for order. */
  t: number;
}

export const KEEP_GAMES = 5;

/** Add entries, keeping the last five games. */
export function addEntries(list: LogEntry[], add: LogEntry[]): LogEntry[] {
  const all = [...list, ...add];
  const games: string[] = [];
  for (let i = all.length - 1; i >= 0; i--) if (!games.includes(all[i]!.game)) games.push(all[i]!.game);
  const keep = new Set(games.slice(0, KEEP_GAMES));
  return all.filter((e) => keep.has(e.game)).slice(-2000);
}

/** Read a saved history back; anything malformed is dropped entry by entry. */
export function parseEntries(text: string | null): LogEntry[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is LogEntry => !!e && typeof e === 'object' && typeof (e as LogEntry).text === 'string' && typeof (e as LogEntry).game === 'string'
      && Array.isArray((e as LogEntry).teams) && ['major', 'important', 'normal'].includes((e as LogEntry).level));
  } catch { return []; }
}

export type HistFilter = 'all' | 'big' | string;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clock = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, '0')}`;

/**
 * The list. `newestFirst` when it opens downward (the newest row is next to the bar); upward, the
 * newest is at the bottom, still next to the bar. The filter row is at the end away from the bar.
 */
export function historyView(list: LogEntry[], filter: HistFilter, B: BarStrings, newestFirst: boolean): string {
  const teams = list.length ? list[list.length - 1]!.teams : null;
  const pick = (e: LogEntry) => filter === 'all' || (filter === 'big' ? e.level !== 'normal' : e.code === filter || e.victim === filter);
  const shown = list.filter(pick);
  const groups: { head: string; rows: LogEntry[] }[] = [];
  for (const e of shown) {
    const g = groups[groups.length - 1];
    if (g && g.head === e.game) g.rows.push(e);
    else groups.push({ head: e.game, rows: [e] });
  }
  const row = (e: LogEntry) => `<div class="hrow${e.level === 'major' ? ' major' : ''}"><span class="t">${e.at === null ? '' : clock(e.at)}</span>`
    + `<span class="who">${e.side ? `<i class="dot" style="background:${TEAM_COLOUR[e.side]}"></i>` : ''}${e.code ? `<button class="code" data-team="${esc(e.code)}">${esc(e.code)}</button>` : ''}</span>`
    + `<span class="x" title="${esc(e.text)}">${esc(e.text)}</span></div>`;
  const block = (g: { rows: LogEntry[] }) => {
    const f = g.rows[0]!;
    const rows = newestFirst ? [...g.rows].reverse() : g.rows;
    return `<div class="hgroup"><div class="hhead">${esc(f.n === null ? `${f.teams[0]} vs ${f.teams[1]}` : B.hist.game(f.n, f.teams[0], f.teams[1]))}</div>${rows.map(row).join('')}</div>`;
  };
  const ordered = newestFirst ? [...groups].reverse() : groups;
  const body = shown.length ? ordered.map(block).join('') : `<p class="hempty">${esc(B.hist.empty)}</p>`;
  const opt = (v: string, label: string) => `<button data-hfilter="${esc(v)}" aria-pressed="${filter === v}">${esc(label)}</button>`;
  const filters = `<div class="hfilter">${opt('all', B.hist.all)}${opt('big', B.hist.big)}${teams ? opt(teams[0], teams[0]) + opt(teams[1], teams[1]) : ''}</div>`;
  const listHtml = `<div class="hlist${newestFirst ? '' : ' up'}">${body}</div>`;
  return newestFirst ? listHtml + filters : filters + listHtml;
}
