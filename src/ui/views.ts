// Text parts of the main window for each size tier. Pure string builders: state in, HTML out.
// The tower map is drawn by src/render/map-svg.ts, the dragon marks by src/render/dragons.ts.

import { TEAMS, type MatchState, type Team } from '../model/types.ts';
import { fmtClock, left, timersOn, towerDown } from '../model/clock.ts';
import type { Connection } from '../data/streamcv/source.ts';
import type { Strings } from '../i18n/index.ts';
import type { Feature, GoldView } from '../settings/schema.ts';
import { dragonMark, ELEMENT_COLOUR, emptySlot } from '../render/dragons.ts';
import { mapSvg, TEAM_COLOUR } from '../render/map-svg.ts';

export type Tier = 'dot' | 'bar' | 'map';

/** The window's content height picks the level of detail, as in Basesmall. */
export function tierOf(height: number): Tier {
  return height < 44 ? 'dot' : height < 120 ? 'bar' : 'map';
}

export interface ViewCtx {
  s: MatchState;
  /** The clock to draw now (ticks between snapshots). */
  clock: number | null;
  show: Record<Feature, boolean>;
  gold: GoldView;
  S: Strings;
  conn: Connection;
  /** Showing the bundled sample instead of the service (dev mode). */
  sample: boolean;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dot = (t: Team) => `<i class="dot" style="background:${TEAM_COLOUR[t]}"></i>`;

/** 59398 -> "59.4k". */
export function fmtGold(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

const BARON_GLYPH = '<path d="M1 9.2 Q1 2.4 5 0.8 Q9 2.4 9 9.2 Z"/>';
export const baronMark = (size: number, title: string) =>
  `<svg class="drake" width="${size}" height="${size}" viewBox="0 0 10 10" fill="var(--baron)"><title>${esc(title)}</title>${BARON_GLYPH}</svg>`;

function goldHtml(c: ViewCtx): string {
  if (!c.show.gold) return '';
  const b = c.s.teams.B.gold, r = c.s.teams.R.gold;
  if (b === null || r === null) return '';
  if (c.gold === 'totals') return `<span class="gold mono" title="${esc(c.S.ui.gold)}">${fmtGold(b)}<span class="muted"> · </span>${fmtGold(r)}</span>`;
  const d = b - r;
  const lead: Team | null = d > 0 ? 'B' : d < 0 ? 'R' : null;
  return `<span class="gold mono${lead ? ` lead-${lead}` : ''}" title="${esc(c.S.ui.gold)}">${lead ? dot(lead) : ''}${d === 0 ? '±0' : `+${fmtGold(Math.abs(d))}`}</span>`;
}

/** Kills with team dots, the clock and the gold lead: the one line every tier shows. */
export function scoreLine(c: ViewCtx): string {
  const k = (t: Team) => c.s.teams[t].kills ?? '–';
  const kills = c.show.kills ? `<span class="kills mono" title="${esc(c.S.ui.kills)}">${dot('B')}${k('B')}<span class="muted">:</span>${k('R')}${dot('R')}</span>` : '';
  const clock = c.show.clock && c.clock !== null ? `<span class="clock mono">${fmtClock(c.clock)}</span>` : '';
  return `${kills}${clock}${goldHtml(c)}`;
}

/** Status words when the game is not simply on, plus the connection and sample flags. */
function flags(c: ViewCtx, short = false): string {
  const out: string[] = [];
  const st = c.s.status;
  if (st === 'finished' || st === 'waiting') out.push(`<span class="status" title="${esc(c.S.status[st])}">${esc(short ? c.S.statusShort[st] : c.S.status[st])}</span>`);
  if (c.sample) out.push(`<span class="tag" title="${esc(c.S.ui.sampleHint)}">${esc(short ? c.S.ui.sampleShort : c.S.ui.sample)}</span>`);
  else if (c.conn === 'retrying') out.push(`<i class="conn" title="${esc(c.S.connection.retrying)}"></i>`);
  return out.join('');
}

/** A team's drakes (with empty slots up to four), soul, elders and barons. */
export function teamLine(c: ViewCtx, t: Team, size = 12): string {
  const team = c.s.teams[t];
  const bits: string[] = [dot(t)];
  if (c.show.dragons) {
    const marks = team.dragons.map((e) => dragonMark(e, size, c.S.element[e]));
    const soulHere = c.s.soul?.team === t;
    const slots = soulHere || team.dragons.length >= 4 ? 0 : 4 - team.dragons.length;
    bits.push(`<span class="drakes">${marks.join('')}${Array.from({ length: slots }, () => emptySlot(size)).join('')}</span>`);
    if (team.elders) bits.push(`<span class="count" title="${esc(c.S.element.elder)}">${dragonMark('elder', size)}${team.elders > 1 ? `×${team.elders}` : ''}</span>`);
  }
  if (c.show.soul && c.s.soul?.team === t) {
    const el = c.s.soul.element;
    bits.push(`<span class="soul" style="--c:${ELEMENT_COLOUR[el]}" title="${esc(`${c.S.ui.soul} · ${c.S.element[el]}`)}">${dragonMark(el, size - 2)}${esc(c.S.ui.soul)}</span>`);
  }
  if (c.show.barons && team.barons) bits.push(`<span class="count baron mono">${baronMark(size, c.S.ui.baron)}${team.barons > 1 ? `×${team.barons}` : ''}</span>`);
  return bits.join('');
}

/** Next dragon and baron: a countdown, or "up" once the time has come. Only while the game is on. */
export function nextLine(c: ViewCtx, size = 12): string {
  if (!timersOn(c.s)) return '';
  const out: string[] = [];
  const nd = c.s.nextDragon;
  if (c.show.nextDragon && nd) {
    const mark = nd.elder ? dragonMark('elder', size, c.S.element.elder) : nd.element ? dragonMark(nd.element, size, c.S.element[nd.element]) : `<span class="muted" title="${esc(c.S.ui.unknownElement)}">?</span>`;
    const l = left(nd.at, c.clock);
    out.push(`<span class="next">${mark}<span class="mono">${l === null ? esc(c.S.ui.dragonUp) : fmtClock(l)}</span></span>`);
  }
  const nb = c.s.nextBaron;
  if (c.show.nextBaron && nb) {
    const l = left(nb.at, c.clock);
    out.push(`<span class="next">${baronMark(size, c.S.ui.baron)}<span class="mono">${l === null ? esc(c.S.ui.baronUp) : fmtClock(l)}</span></span>`);
  }
  return out.join('');
}

/** Running countdowns: buffs, inhibitors and nexus turrets coming back. */
export function timerChips(c: ViewCtx): string {
  if (!timersOn(c.s)) return '';
  const chips: { at: number; html: string }[] = [];
  const chip = (t: Team, label: string, l: number, cls = '') =>
    `<span class="chip ${cls}">${dot(t)}${label}<span class="mono">${fmtClock(l)}</span></span>`;
  if (c.show.buffs) {
    for (const b of c.s.buffs) {
      const l = left(b.until, c.clock);
      if (l === null) continue;
      const label = b.kind === 'baron' ? baronMark(11, c.S.ui.baronBuff) : dragonMark('elder', 11, c.S.ui.elderBuff);
      chips.push({ at: b.until, html: chip(b.team, label, l, 'buff') });
    }
  }
  for (const t of TEAMS) {
    const team = c.s.teams[t];
    if (c.show.inhibitors) {
      for (const i of team.inhibitorsDown) {
        const l = left(i.respawnAt, c.clock);
        if (l !== null) chips.push({ at: i.respawnAt, html: chip(t, `<span class="k">${esc(c.S.ui.inhibitor)}</span>`, l) });
      }
    }
    if (c.show.nexusTimers && c.s.towersKnown) {
      // Both turrets usually fall together: one chip per respawn time.
      const byTime = new Map<number, number>();
      for (const site of ['nexus_t1', 'nexus_t2'] as const) {
        const tw = team.towers[site];
        if (tw.respawnAt !== null && towerDown(tw, c.s, c.clock)) byTime.set(tw.respawnAt, (byTime.get(tw.respawnAt) ?? 0) + 1);
      }
      for (const [at, n] of byTime) {
        const l = left(at, c.clock);
        if (l !== null) chips.push({ at, html: chip(t, `<span class="k">${esc(c.S.ui.nexusTurret)}${n > 1 ? `×${n}` : ''}</span>`, l) });
      }
    }
  }
  return chips.sort((a, b) => a.at - b.at).map((x) => x.html).join('');
}

function idleView(c: ViewCtx): string {
  const words = c.conn === 'retrying' ? c.S.connection.retrying : c.conn === 'connecting' ? c.S.connection.connecting : c.S.status[c.s.status];
  return `<div class="idle">${c.conn === 'retrying' ? '<i class="conn"></i>' : ''}<span class="muted">${esc(words)}</span></div>`;
}

const hasGame = (c: ViewCtx) => c.s.status === 'in_game' || c.s.status === 'finished';

export function dotView(c: ViewCtx): string {
  if (!hasGame(c)) return idleView(c);
  return `<div class="pill">${scoreLine(c)}${flags(c, true)}</div>`;
}

export function barView(c: ViewCtx): string {
  if (!hasGame(c)) return idleView(c);
  return `<div class="bar">
    <div class="l1">${scoreLine(c)}<span class="grow"></span>${flags(c)}</div>
    <div class="l2"><span class="side">${teamLine(c, 'B', 11)}</span><span class="side">${teamLine(c, 'R', 11)}</span><span class="grow"></span>${nextLine(c, 11)}</div>
  </div>`;
}

export function mapView(c: ViewCtx, withMap: boolean): string {
  if (!hasGame(c)) return idleView(c);
  const map = withMap && c.show.towers
    ? `<div class="mapwrap">${mapSvg(c.s, c.clock, { inhibitors: c.show.inhibitors, unnamed: c.S.unnamed, unnamedTitle: esc(c.S.ui.towersUnnamed), unknownTitle: esc(c.S.ui.towersUnknown) })}</div>`
    : '';
  const next = nextLine(c);
  const chips = timerChips(c);
  // Status and the sample flag get their own line: on the score line they were the first thing cut.
  const f = flags(c);
  return `<div class="game">${map}
    <div class="hud">
      <div class="row l1">${scoreLine(c)}</div>
      <div class="row team">${teamLine(c, 'B')}</div>
      <div class="row team">${teamLine(c, 'R')}</div>
      ${next ? `<div class="row nextrow">${next}</div>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${f ? `<div class="foot">${f}</div>` : ''}
    </div>
  </div>`;
}
