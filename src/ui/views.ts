// Text parts of the main window: the tab strip, the three size tiers and the views under the game.
// Pure string builders: state in, HTML out. The tower map is drawn by src/render/map-svg.ts.
// Words before symbols: every capsule says what it counts ("小龍", "巴龍", "紅方水晶"), and colour
// only repeats what the words say.

import { TEAMS, type DraftGame, type MatchState, type Player, type Team } from '../model/types.ts';
import { fmtClock, left, timersOn, towerDown } from '../model/clock.ts';
import type { Connection } from '../data/streamcv/source.ts';
import { championName } from '../data/champions.ts';
import { itemName, minorItem } from '../data/items.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import type { Feature, GoldView, ViewName } from '../settings/schema.ts';
import { ELEMENT_COLOUR } from '../render/dragons.ts';
import { mapSvg, TEAM_COLOUR } from '../render/map-svg.ts';
import type { Schedule } from '../model/schedule.ts';
import type { History } from '../model/history.ts';
import { findPlayer, kda, tally } from '../data/streamcv/history.ts';
import type { RosterTeam } from '../model/roster.ts';
import { rosterPlayer } from '../data/streamcv/roster.ts';
import { playerCard, teamCard } from './roster-text.ts';
import { nextMatchCard, nextMatchLine, type ScheduleCtx } from './schedule-views.ts';
import type { Element } from '../model/types.ts';

export type Tier = 'dot' | 'bar' | 'map';

/** Height of the tab strip above the game, and of each view under it. */
export const TAB_H = 22;
const VIEW_H: Record<ViewName, number> = { draftGame: 134, draftSeries: 152, players: 0, schedule: 236 };
/** Players: two lines a player with item names, one without. Draft: two more lines a team with this event's tendencies. */
export function viewHeight(v: ViewName, show: Record<Feature, boolean>): number {
  if (v === 'players') return show.playerItems ? 420 : 290;
  if (v === 'draftGame') return show.tendencies ? 230 : VIEW_H.draftGame;
  return VIEW_H[v];
}

/** The window minus the views under it picks the level of detail, as in Basesmall. */
export function tierOf(height: number): Tier {
  return height < 50 ? 'dot' : height - TAB_H < 100 ? 'bar' : 'map';
}

export interface ViewCtx {
  s: MatchState;
  /** The clock to draw now (ticks between snapshots). */
  clock: number | null;
  show: Record<Feature, boolean>;
  gold: GoldView;
  S: Strings;
  lang: Lang;
  conn: Connection;
  /** Showing the bundled sample instead of the service (dev mode). */
  sample: boolean;
  /** The season schedule, for when no game is on; null until read. */
  schedule: Schedule | null;
  /** Wall-clock time now (ms), for countdowns to the next match. */
  now: number;
  spoilerFree: boolean;
  /** This event's finished games, per team and player; null parts until read. */
  history: History;
  /** The match picked in the schedule view, to show both teams. */
  pickedMatch: string | null;
  /** The event's teams by code (seeds, rosters, coaches); null until read. */
  roster: Record<string, RosterTeam> | null;
  /** For tests: the time zone to show times in. */
  timeZone?: string;
}

export const schedCtx = (c: ViewCtx): ScheduleCtx => ({
  schedule: c.schedule, now: c.now, spoilerFree: c.spoilerFree, S: c.S, lang: c.lang, history: c.history, picked: c.pickedMatch, roster: c.roster,
  ...(c.timeZone ? { timeZone: c.timeZone } : {}),
});

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dot = (t: Team) => `<i class="dot" style="background:${TEAM_COLOUR[t]}"></i>`;
/** The team's code when the series is known ("T1"), else its side ("藍方"). */
const teamName = (c: ViewCtx, t: Team) => c.s.series?.teams[t].code ?? c.S.team[t];
/** A team's card on hover: name, seed, how it qualified, coaches. */
const teamTip = (c: ViewCtx, code: string) => { const r = c.roster?.[code]; return r ? ` title="${esc(teamCard(c.S, r))}"` : ''; };
const teamText = (c: ViewCtx, t: Team) => `<b class="tn" style="color:${TEAM_COLOUR[t]}"${teamTip(c, teamName(c, t))}>${esc(teamName(c, t))}</b>`;
/** "LEC #3" next to a team where there is room. */
const seedTag = (c: ViewCtx, code: string) => { const s = c.roster?.[code]?.seedLabel; return s ? `<span class="seed">${esc(s)}</span>` : ''; };

/** 59398 -> "59.4k". */
export function fmtGold(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/** A dragon as a small coloured tile with one character in it. */
export function elementTile(c: ViewCtx, e: Element | 'elder'): string {
  return `<span class="el" style="--c:${ELEMENT_COLOUR[e]}" title="${esc(c.S.element[e])}">${esc(c.S.elementShort[e])}</span>`;
}

function goldHtml(c: ViewCtx): string {
  if (!c.show.gold) return '';
  const b = c.s.teams.B.gold, r = c.s.teams.R.gold;
  if (b === null || r === null) return '';
  if (c.gold === 'totals') return `<span class="gold"><span class="k">${esc(c.S.ui.gold)}</span><span class="mono">${fmtGold(b)} : ${fmtGold(r)}</span></span>`;
  const d = b - r;
  const lead: Team | null = d > 0 ? 'B' : d < 0 ? 'R' : null;
  const who = lead ? `${teamText(c, lead)} ` : '';
  return `<span class="gold"><span class="k">${esc(c.S.ui.gold)}</span>${who}<span class="mono${lead ? ` lead-${lead}` : ''}">${d === 0 ? '±0' : `+${fmtGold(Math.abs(d))}`}</span></span>`;
}

/** "● 藍方 22 : 8 紅方 ●", the score line every tier starts with. */
function killsHtml(c: ViewCtx, names: boolean): string {
  if (!c.show.kills) return '';
  const k = (t: Team) => c.s.teams[t].kills ?? '–';
  const name = (t: Team) => (names ? `<span class="muted">${esc(teamName(c, t))}</span>` : '');
  return `<span class="kills mono" title="${esc(c.S.ui.kills)}">${dot('B')}${name('B')}<b>${k('B')}</b><span class="muted">:</span><b>${k('R')}</b>${name('R')}${dot('R')}</span>`;
}
const clockHtml = (c: ViewCtx) => (c.show.clock && c.clock !== null ? `<span class="clock mono">${fmtClock(c.clock)}</span>` : '');

/** Status words when the game is not simply on, plus the connection and sample flags. */
function flags(c: ViewCtx, short = false): string {
  const out: string[] = [];
  const st = c.s.status;
  if (st === 'finished' || st === 'waiting') out.push(`<span class="status" title="${esc(c.S.status[st])}">${esc(short ? c.S.statusShort[st] : c.S.status[st])}</span>`);
  if (c.sample) out.push(`<span class="tag" title="${esc(c.S.ui.sampleHint)}">${esc(short ? c.S.ui.sampleShort : c.S.ui.sample)}</span>`);
  else if (c.conn === 'retrying') out.push(`<i class="conn" title="${esc(c.S.connection.retrying)}"></i>`);
  return out.join('');
}

/** A team's dragons (empty tiles up to four), soul, elders and barons, each with its word. */
export function teamLine(c: ViewCtx, t: Team, named = true): string {
  const team = c.s.teams[t];
  const bits: string[] = [named ? `${dot(t)}${teamText(c, t)}` : dot(t)];
  if (c.show.dragons) {
    const soulHere = c.show.soul && c.s.soul?.team === t;
    const slots = soulHere || team.dragons.length >= 4 ? 0 : 4 - team.dragons.length;
    bits.push(`<span class="tiles">${team.dragons.map((e) => elementTile(c, e)).join('')}${'<span class="el empty slot"></span>'.repeat(slots)}</span>`);
    if (team.elders) bits.push(`<span class="count"><span class="k">${esc(c.S.ui.elder)}</span>${team.elders}</span>`);
  }
  if (c.show.soul && c.s.soul?.team === t) {
    const el = c.s.soul.element;
    bits.push(`<span class="soul" style="--c:${ELEMENT_COLOUR[el]}">${esc(c.S.ui.soul)}·${esc(c.S.elementShort[el])}</span>`);
  }
  const grubs = c.s.voidgrubs?.[t];
  const tail: string[] = [];
  if (c.show.voidgrubs && grubs) tail.push(`<span class="count"><span class="k">${esc(c.S.ui.grubs)}</span>${grubs}</span>`);
  if (c.show.barons && team.barons) tail.push(`<span class="count"><span class="k">${esc(c.S.ui.baron)}</span>${team.barons}</span>`);
  // Who took the herald, once the service saw the kill announcement (v0.5). One herald a game: no number.
  const h = c.s.herald;
  if (c.show.herald && h?.team === t && (h.status === 'taken' || h.status === 'taken_or_despawned')) {
    tail.push(`<span class="count" title="${esc(h.at === null ? c.S.ui.herald : `${c.S.ui.herald} ${fmtClock(h.at)}`)}"><span class="k">${esc(c.S.ui.herald)}</span></span>`);
  }
  if (tail.length) bits.push(`<span class="counts push">${tail.join('')}</span>`);
  return bits.join('');
}

/** "下一隻 [化] 4:00 · 巴龍 1:23", only while the game is on. */
export function nextLine(c: ViewCtx): string {
  if (!timersOn(c.s)) return '';
  const out: string[] = [];
  const nd = c.s.nextDragon;
  if (c.show.nextDragon && nd) {
    const guess = nd.elementSource === 'rules';
    const tile = nd.elder ? elementTile(c, 'elder') : nd.element ? elementTile(c, nd.element) : `<span class="el empty" title="${esc(c.S.ui.unknownElement)}">?</span>`;
    // Worked out from the rules, not read off the broadcast: a dashed outline, and the reason on hover.
    const mark = guess && !nd.elder && nd.element ? `<span class="guess" title="${esc(c.S.ui.elementByRules)}">${tile}</span>` : tile;
    const l = left(nd.at, c.clock);
    out.push(`<span class="next"><span class="k">${esc(c.S.ui.next)}</span>${mark}<span class="mono">${l === null ? esc(c.S.ui.dragonUp) : fmtClock(l)}</span></span>`);
  }
  // The top pit: grubs, then herald, then baron. The broadcast says which is next (v0.4).
  if (c.show.herald && c.s.pitNext === 'herald' && c.s.herald && (c.s.herald.status === 'upcoming' || c.s.herald.status === 'alive_or_upcoming')) {
    const l = left(15 * 60, c.clock);
    out.push(`<span class="next"><span class="k">${esc(c.S.ui.herald)}</span><span class="mono">${l !== null ? fmtClock(l) : esc(c.S.ui.heraldMaybeUp)}</span></span>`);
  }
  const nb = c.s.nextBaron;
  if (c.show.nextBaron && nb && c.s.pitNext !== 'grubs' && c.s.pitNext !== 'herald') {
    const l = left(nb.at, c.clock);
    out.push(`<span class="next"><span class="k">${esc(c.S.ui.baron)}</span><span class="mono">${l === null ? esc(c.S.ui.baronUp) : fmtClock(l)}</span></span>`);
  }
  return out.join('');
}

/**
 * Running countdowns as words: "藍方 巴龍增益 2:10", "紅方水晶 2:40". Inhibitor and nexus timers
 * are on the map, on the building itself; they come here only when the map is not drawn, or when
 * it cannot tell which lane's inhibitor it is.
 */
export function timerChips(c: ViewCtx, mapShown: boolean): string {
  if (!timersOn(c.s)) return '';
  const chips: { at: number; html: string }[] = [];
  const chip = (t: Team, label: string, l: number) =>
    `<span class="chip" style="--t:${TEAM_COLOUR[t]}">${label}<span class="mono">${fmtClock(l)}</span></span>`;
  if (c.show.buffs) {
    for (const b of c.s.buffs) {
      const l = left(b.until, c.clock);
      if (l !== null) chips.push({ at: b.until, html: chip(b.team, `${teamText(c, b.team)}<span class="k">${esc(b.kind === 'baron' ? c.S.ui.baronBuff : c.S.ui.elderBuff)}</span>`, l) });
    }
  }
  const onMap = mapShown && c.show.towers && c.s.towersKnown;
  for (const t of TEAMS) {
    const team = c.s.teams[t];
    if (c.show.inhibitors) {
      for (const i of team.inhibitorsDown) {
        if (onMap && i.lane) continue;
        const l = left(i.respawnAt, c.clock);
        if (l !== null) chips.push({ at: i.respawnAt, html: chip(t, `<span class="k">${esc(c.S.whose(teamName(c, t), c.S.ui.inhibitor))}</span>`, l) });
      }
    }
    if (c.show.nexusTimers && c.s.towersKnown && !onMap) {
      const back = (['nexus_t1', 'nexus_t2'] as const).map((s) => team.towers[s]).filter((tw) => tw.respawnAt !== null && towerDown(tw, c.s, c.clock)).map((tw) => tw.respawnAt!);
      const at = back.length ? Math.min(...back) : null;
      const l = at === null ? null : left(at, c.clock);
      if (at !== null && l !== null) chips.push({ at, html: chip(t, `<span class="k">${esc(c.S.whose(teamName(c, t), c.S.ui.nexusTurret))}</span>`, l) });
    }
  }
  return chips.sort((a, b) => a.at - b.at).map((x) => x.html).join('');
}

/** No game on: the next match (setting nextMatch), once the service has answered. */
function idleView(c: ViewCtx, tier: Tier = 'map'): string {
  if (c.s.status === 'idle' && c.show.nextMatch && (c.sample || c.conn === 'ok') && c.schedule) {
    return tier === 'map' ? nextMatchCard(schedCtx(c)) : `<div class="${tier === 'dot' ? 'pill' : 'bar nmline'}">${nextMatchLine(schedCtx(c))}</div>`;
  }
  // With data in hand (the service answered, or the sample), say where the game is; else the connection.
  const words = c.sample || c.conn === 'ok' ? c.S.status[c.s.status] : c.conn === 'retrying' ? c.S.connection.retrying : c.S.connection.connecting;
  return `<div class="idle">${c.conn === 'retrying' ? '<i class="conn"></i>' : ''}<span class="muted">${esc(words)}</span></div>`;
}

const hasGame = (c: ViewCtx) => c.s.status === 'in_game' || c.s.status === 'finished';

export function dotView(c: ViewCtx): string {
  if (!hasGame(c)) return idleView(c, 'dot');
  return `<div class="pill">${killsHtml(c, false)}${clockHtml(c)}${goldHtml(c)}${flags(c, true)}</div>`;
}

export function barView(c: ViewCtx): string {
  if (!hasGame(c)) return idleView(c, 'bar');
  return `<div class="bar">
    <div class="l1">${killsHtml(c, true)}${clockHtml(c)}${goldHtml(c)}<span class="grow"></span>${flags(c)}</div>
    <div class="l2"><span class="side">${teamLine(c, 'B', false)}</span><span class="side">${teamLine(c, 'R', false)}</span><span class="grow"></span>${nextLine(c)}</div>
  </div>`;
}

export function mapView(c: ViewCtx, withMap: boolean): string {
  if (!hasGame(c)) return idleView(c);
  const drawMap = withMap && c.show.towers;
  const map = drawMap
    ? `<div class="mapwrap">${mapSvg(c.s, c.clock, {
      inhibitors: c.show.inhibitors, inhibTimers: c.show.inhibitors, nexusTimers: c.show.nexusTimers,
      unnamed: c.S.unnamed, unnamedTitle: esc(c.S.ui.towersUnnamed), unknownTitle: esc(c.S.ui.towersUnknown),
    })}</div>`
    : '';
  const next = nextLine(c);
  const chips = timerChips(c, drawMap);
  const gold = goldHtml(c);
  const f = flags(c);
  return `<div class="game">${map}
    <div class="hud">
      <div class="row l1">${killsHtml(c, false)}<span class="grow"></span>${clockHtml(c)}</div>
      ${gold ? `<div class="row">${gold}</div>` : ''}
      <div class="row team">${teamLine(c, 'B')}</div>
      <div class="row team">${teamLine(c, 'R')}</div>
      ${next ? `<div class="row nextrow">${next}</div>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${f ? `<div class="foot">${f}</div>` : ''}
    </div>
  </div>`;
}

// ---------- tab strip ----------

/** "● MVK 1–1 FUR ●", or "● MVK vs FUR ●" when the service could not tell the wins (its note in the tooltip). */
function seriesScore(c: ViewCtx): string {
  const se = c.s.series!;
  const b = se.teams.B, r = se.teams.R;
  const known = b.wins !== null && r.wins !== null;
  const mid = known ? ` ${b.wins}–${r.wins} ` : ` <span class="muted">${esc(c.S.ui.vs)}</span> `;
  const title = known ? '' : ` title="${esc(se.winsNote ?? c.S.ui.winsUnknown)}"`;
  return `<span class="score mono"${title}>${dot('B')}${esc(b.code)}${mid}${esc(r.code)}${dot('R')}</span>`;
}

/** "藍紅待確認" while the sides may be swapped (v0.4 sidesSource api_unconfirmed). */
function sidesFlag(c: ViewCtx): string {
  return c.s.series?.sidesSource === 'api_unconfirmed' ? `<span class="tag" title="${esc(c.S.ui.sidesUnconfirmedHint)}">${esc(c.S.ui.sidesUnconfirmed)}</span>` : '';
}

/** Left: which game of the series. Right: the views under the game, settings, quit. */
export function tabsView(c: ViewCtx, open: Record<ViewName, boolean>, canQuit: boolean, quitArmed: boolean): string {
  const se = c.s.series;
  let series = '';
  // No game on: the next match is on screen already, and "no series data" would only be noise.
  if (c.show.series && c.s.status !== 'idle') {
    series = se
      ? `<span class="tab series"><b>${esc(c.S.seriesGame(se.bestOf, se.game))}</b>${seriesScore(c)}${sidesFlag(c)}</span>`
      : `<span class="tab series muted">${esc(c.S.ui.noSeries)}</span>`;
  }
  const toggle = (v: ViewName) => `<button class="vt" data-view="${v}" aria-pressed="${open[v]}">${esc(c.S.view[v])}</button>`;
  const quit = canQuit ? `<button class="quit${quitArmed ? ' armed' : ''}" data-action="quit" title="${esc(c.S.ui.quit)}">${quitArmed ? esc(c.S.ui.quitAgain) : '✕'}</button>` : '';
  return `${series}<span class="grow"></span><span class="views">${toggle('draftGame')}${toggle('draftSeries')}${toggle('players')}${toggle('schedule')}</span>
    <span class="controls"><button data-action="settings" title="${esc(c.S.ui.settings)}">⚙</button>${quit}</span>`;
}

// ---------- views under the game: draft of this game, and of the whole series ----------

const champ = (c: ViewCtx, id: string | null, kind: 'ban' | 'pick', side: Team, now = false) => {
  if (!id) return `<span class="ch empty${now ? ' now' : ''}"${now ? ` title="${esc(c.S.ui.turn)}"` : ''}></span>`;
  const name = championName(id, c.lang);
  return `<span class="ch ${kind}" style="--t:${TEAM_COLOUR[side]}" title="${esc(name)}">${esc(name)}</span>`;
};

function noDraft(c: ViewCtx, title: string): string {
  return `<header><b>${esc(title)}</b></header><p class="empty-note muted">${esc(c.S.ui.noDraft)}</p>`;
}

export function draftGameView(c: ViewCtx): string {
  const g = c.s.draft?.current;
  if (!g) return noDraft(c, c.S.view.draftGame);
  const d = c.s.draft!;
  const byRole = d.picksOrder === 'role';
  const line = (t: Team, kind: 'ban' | 'pick') => {
    const label = `<span class="k">${esc(kind === 'ban' ? c.S.ui.bans : c.S.ui.picks)}</span>`;
    // The service cannot see bans yet: say so, rather than draw five empty slots that look like "none yet".
    if (kind === 'ban' && !d.bansSupported) return `${label}<span class="unsupported muted">${esc(c.S.ui.bansUnsupported)}</span>`;
    const list = kind === 'ban' ? g.sides[t].bans : g.sides[t].picks;
    if (kind === 'pick' && byRole && list.every((x) => x === null)) return `${label}<span class="unsupported muted">${esc(c.S.ui.picksAtStart)}</span>`;
    // Five empty bans after the draft: the service never saw this game's draft (v0.3), not "no bans".
    if (kind === 'ban' && c.s.status !== 'waiting' && list.every((x) => x === null)) return `${label}<span class="unsupported muted">${esc(c.S.ui.bansMissing)}</span>`;
    const now = (i: number) => g.turn?.side === t && g.turn.kind === kind && g.turn.slot === i;
    // Positions are not marked here; they are in the players view (maintainer, 2026-10-16).
    return label + list.map((id, i) => champ(c, id, kind, t, now(i))).join('');
  };
  const tend = (t: Team) => (c.show.tendencies ? tendencyLines(c, g.sides[t].team) : '');
  return `<header><b>${esc(c.S.view.draftGame)}</b><span class="muted">${esc(c.S.gameNo(g.game))}</span>${sidesFlag(c)}</header>
    <div class="dgrid${c.show.tendencies ? ' tend' : ''}">${TEAMS.map((t) => `<div class="dteam">${dot(t)}<span class="dtn"><b class="tn" style="color:${TEAM_COLOUR[t]}"${teamTip(c, g.sides[t].team)}>${esc(g.sides[t].team)}</b>${seedTag(c, g.sides[t].team)}</span></div>
      <div class="dline">${line(t, 'ban')}</div><div class="dline">${line(t, 'pick')}</div>${tend(t)}`).join('')}</div>`;
}

/** A champion with how often: "夜曲×5". */
const tendChip = (c: ViewCtx, id: string, n: number) => {
  const name = championName(id, c.lang);
  return `<span class="ch tendc" title="${esc(name)}">${esc(name)}<i>×${n}</i></span>`;
};

/** "常禁 夜曲×5 …" and "常選 …" for one team, this event (the service's recorded games only). */
export function tendencyLines(c: ViewCtx, code: string): string {
  const games = c.history.teams?.[code];
  if (!c.history.teams) return '';
  if (!games?.length) return `<div class="dline tend span2"><span class="muted" title="${esc(c.S.ui.historyScope)}">${esc(c.S.ui.noHistory)}</span></div>`;
  const row = (what: 'bans' | 'picks', label: string) =>
    `<div class="dline tend"><span class="k" title="${esc(`${c.S.eventGames(games.length)} · ${c.S.ui.historyScope}`)}">${esc(label)}</span>${tally(games, what).map(([id, n]) => tendChip(c, id, n)).join('')}</div>`;
  return row('bans', c.S.ui.tendBans) + row('picks', c.S.ui.tendPicks);
}

/** "本屆 薩亨 2 場 1 勝 · KDA 3.5" and the rest of the pool, for a tooltip. Wins only when scores may show. */
export function poolTitle(c: ViewCtx, code: string | null, shortName: string, champion: string | null): string {
  const p = findPlayer(c.history.players, code, shortName);
  if (!p) return '';
  const w = (x: number | null) => (c.spoilerFree ? null : x);
  const lines: string[] = [];
  const here = champion ? p.pool.find((e) => e.champion === champion) : undefined;
  if (here && champion) lines.push(`${c.S.ui.thisEvent} ${championName(champion, c.lang)}：${c.S.games(here.games, w(here.wins))} · KDA ${kda(here).toFixed(1)}`);
  lines.push(`${c.S.ui.pool}（${c.S.eventGames(p.games)}）：${p.pool.map((e) => `${championName(e.champion, c.lang)} ${c.S.games(e.games, w(e.wins))}`).join('、')}`);
  return lines.join('\n');
}

/**
 * Fearless draft: every pick of the earlier games is locked. One row per team per game, grouped by
 * team (teams can swap sides between games; the dot shows the side it had that game). Full names:
 * the point of this view is "is X still open?", which a cut-off name cannot answer.
 */
export function draftSeriesView(c: ViewCtx): string {
  const d = c.s.draft;
  if (!d) return noDraft(c, c.S.view.draftSeries);
  const order = d.current ? [d.current.sides.B.team, d.current.sides.R.team] : d.earlier[0] ? [d.earlier[0].sides.B.team, d.earlier[0].sides.R.team] : [];
  const locked = d.earlier.reduce((n, g) => n + TEAMS.reduce((m, t) => m + g.sides[t].picks.filter(Boolean).length, 0), 0);
  const sideOf = (g: DraftGame, code: string): Team => (g.sides.B.team === code ? 'B' : 'R');
  const head = `<header><b>${esc(c.S.view.draftSeries)}</b><span class="muted">${esc(c.S.locked(locked))}</span></header>`;
  if (!d.earlier.length) return `${head}<p class="empty-note muted">${esc(c.S.ui.noEarlier)}</p>`;
  const rows = order.flatMap((code) => d.earlier.map((g, i) => {
    const t = sideOf(g, code);
    return `<span class="sh">${i === 0 ? `<b class="tn">${esc(code)}</b>` : ''}</span><span class="gn mono">G${g.game}</span>`
      + `<span class="spicks">${dot(t)}${g.sides[t].picks.map((id) => champ(c, id, 'pick', t)).join('')}</span>`;
  })).join('');
  return `${head}<div class="sgrid">${rows}</div><p class="note muted">${esc(c.S.ui.fearless)}</p>`;
}

// ---------- players: position, champion, KDA, CS, gold, health, items ----------

function playerRow(c: ViewCtx, p: Player, t: Team, withItems: boolean): string {
  const rp = rosterPlayer(c.roster, teamName(c, t), p.name);
  const card = rp ? playerCard(c.S, rp) : '';
  const sub = rp && !rp.starter ? `<span class="subtag">${esc(c.S.ui.substitute)}</span>` : '';
  const pool = poolTitle(c, teamName(c, t), p.name, p.champion);
  const n = (v: number | null) => (v === null ? '–' : String(v));
  const kda = `${n(p.kills)}/${n(p.deaths)}/${n(p.assists)}`;
  const hp = p.hp !== null && p.maxHp ? Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100))) : null;
  const champName = p.champion ? championName(p.champion, c.lang) : '–';
  const items = p.items?.filter((i) => !minorItem(i)).map((i) => itemName(i, c.lang)) ?? null;
  const line1 = `<span class="role k">${p.role ? esc(c.S.role[p.role]) : ''}</span>`
    + `<b class="pn${card ? ' has-card' : ''}" title="${esc(card || p.name)}">${esc(p.name)}${sub}</b>`
    + `<span class="pc${pool ? ' has-pool' : ''}" title="${esc(pool || champName)}">${esc(champName)}</span>`
    + `<span class="lv mono"><span class="k">${esc(c.S.ui.level)}</span>${n(p.level)}</span>`
    + `<span class="hp" title="${esc(c.S.ui.hp)}">${hp === null ? '' : `<i style="width:${hp}%"></i>`}</span>`
    + `<span class="kda mono" title="${esc(c.S.ui.kda)}">${kda}</span>`
    + `<span class="cs mono" title="${esc(c.S.ui.cs)}">${n(p.cs)}</span>`
    + `<span class="pg mono">${p.gold === null ? '–' : fmtGold(p.gold)}</span>`;
  const text = items === null ? c.S.ui.itemsUnknown : items.join(' · ');
  const line2 = withItems ? `<div class="items${items === null ? ' unknown' : ''}" title="${esc(text)}">${text ? esc(text) : '&nbsp;'}</div>` : '';
  return `<div class="prow" style="--t:${TEAM_COLOUR[t]}"><div class="p1">${line1}</div>${line2}</div>`;
}

export function playersView(c: ViewCtx): string {
  const ps = c.s.players;
  const head = `<header><b>${esc(c.S.view.players)}</b></header>`;
  if (!ps) return `${head}<p class="empty-note muted">${esc(c.S.ui.noPlayers)}</p>`;
  const withItems = c.show.playerItems;
  return head + TEAMS.map((t) => `<div class="pteam">${dot(t)}${teamText(c, t)}${seedTag(c, teamName(c, t))}</div>`
    + ps[t].map((p) => playerRow(c, p, t, withItems)).join('')).join('');
}
