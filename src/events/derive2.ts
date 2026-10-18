// Batch 2 events (docs/UI_SPEC_v1.md §3): worked out rather than read — countdowns from the timers,
// respawns, one drake from soul, kills from the players' K/D/A, gold leads, level and item milestones,
// and the next draft beginning. Pure apart from `Memory`, which remembers what was already said this
// game so a countdown or a milestone is announced once.

import { legendaryItem } from '../data/items.ts';
import { other, TEAMS, type MatchState, type Team } from '../model/types.ts';
import type { GameEvent } from './kinds.ts';

/** Gold lead steps (in gold), and how far the lead must drop before a step can be announced again. */
export const GOLD_STEPS = [5000, 10000] as const;
const REARM = 0.7;
/** A lead change counts once the old leader had led by this much, and the new one leads by FLIP_NEW. */
export const FLIP_MIN = 3000;
/** At the crossing itself the lead is near zero ("+0k"): wait until the new leader is clearly ahead. */
export const FLIP_NEW = 1000;

export class Memory {
  private game: string | null = null;
  private said = new Set<string>();
  private armed = new Map<string, boolean>();
  private leader: Team | null = null;
  private peak = 0;
  /** Across games (the next draft belongs to no game yet). */
  private ever = new Set<string>();

  everOnce(key: string): boolean {
    if (this.ever.has(key)) return false;
    this.ever.add(key);
    return true;
  }

  /** Start this game over (its clock went back: a replay looping, a service restart). */
  restart(): void { this.game = null; }

  /** True the first time a key is seen this game. */
  once(game: string | null, key: string): boolean {
    if (game !== this.game) { this.game = game; this.said.clear(); this.armed.clear(); this.leader = null; this.peak = 0; }
    if (this.said.has(key)) return false;
    this.said.add(key);
    return true;
  }

  /** Gold steps with hysteresis, and lead changes after a real lead. */
  gold(game: string | null, diff: number): GameEvent[] {
    this.once(game, '');
    const out: GameEvent[] = [];
    for (const step of GOLD_STEPS) {
      for (const t of TEAMS) {
        const lead = t === 'B' ? diff : -diff;
        const key = `${step}${t}`;
        const armed = this.armed.get(key) ?? true;
        if (armed && lead >= step) { this.armed.set(key, false); out.push({ kind: step === 5000 ? 'goldLead5k' : 'goldLead10k', team: t, at: null, lead: step / 1000 }); }
        else if (!armed && lead < step * REARM) this.armed.set(key, true);
      }
    }
    // The leader changes only once the new one is FLIP_NEW ahead (no flapping around zero).
    const now: Team | null = diff >= FLIP_NEW ? 'B' : diff <= -FLIP_NEW ? 'R' : null;
    if (now && this.leader && now !== this.leader && this.peak >= FLIP_MIN) {
      out.push({ kind: 'goldFlip', team: now, victim: this.leader, at: null, lead: Math.round(Math.abs(diff) / 100) / 10 });
    }
    if (now && now !== this.leader) { this.leader = now; this.peak = 0; }
    if (this.leader && (this.leader === 'B' ? diff : -diff) > this.peak) this.peak = Math.abs(diff);
    return out;
  }
}

export interface Options {
  /** Seconds before a spawn to say it is coming (UI_SPEC §3: 15, 30 or 60). */
  soonSec: number;
}

export function deriveMore(prev: MatchState | null, next: MatchState, mem: Memory, o: Options = { soonSec: 30 }): GameEvent[] {
  if (!prev) return [];
  const out: GameEvent[] = [];
  const g = next.gameId;
  const clock = next.clock;

  // The next draft: a new game number in the draft, or the series' first draft.
  const pg = prev.draft?.current?.game, ng = next.draft?.current?.game;
  if (next.status === 'waiting' && ng && (prev.status !== 'waiting' || pg !== ng) && mem.everOnce(`bp-${next.series?.matchId}-${ng}`)) {
    out.push({ kind: 'bpStart', team: null, at: null, n: ng });
  }

  if (next.status !== 'in_game' || clock === null || prev.gameId !== g) return out;
  // The clock went back: what was said belongs to the game's later part, forget it.
  if (prev.clock !== null && clock < prev.clock - 30) mem.restart();

  // Countdowns: once per spawn time.
  const nd = next.nextDragon;
  if (nd) {
    const left = nd.at - clock;
    if (left > 0 && left <= o.soonSec && mem.once(g, `soon-${nd.elder ? 'elder' : 'drake'}-${nd.at}`)) {
      out.push(nd.elder
        ? { kind: 'bossSoon', team: null, at: clock, boss: 'elder', secondsLeft: Math.round(left) }
        : { kind: 'dragonSoon', team: null, at: clock, element: nd.element ?? undefined, secondsLeft: Math.round(left) });
    }
  }
  const nb = next.nextBaron;
  if (nb && next.pitNext !== 'grubs' && next.pitNext !== 'herald') {
    const left = nb.at - clock;
    if (left > 0 && left <= o.soonSec && mem.once(g, `soon-baron-${nb.at}`)) out.push({ kind: 'bossSoon', team: null, at: clock, boss: 'baron', secondsLeft: Math.round(left) });
  }
  for (const b of next.buffs) {
    const left = b.until - clock;
    if (b.kind === 'baron' && left > 0 && left <= 30 && mem.once(g, `buff-${b.team}-${b.until}`)) out.push({ kind: 'baronBuffEnding', team: b.team, at: clock, secondsLeft: Math.round(left) });
  }

  // Respawns: an inhibitor that was down is back; a nexus turret's respawn time has come.
  for (const t of TEAMS) {
    for (const i of prev.teams[t].inhibitorsDown) {
      const still = next.teams[t].inhibitorsDown.some((j) => j.lane === i.lane && j.respawnAt === i.respawnAt);
      if (!still && clock >= i.respawnAt - 10 && mem.once(g, `inhib-${t}-${i.lane}-${i.respawnAt}`)) out.push({ kind: 'inhibRespawn', team: null, victim: t, at: i.respawnAt, lane: i.lane });
    }
    for (const site of ['nexus_t1', 'nexus_t2'] as const) {
      const tw = next.teams[t].towers[site];
      if (tw.down && tw.respawnAt !== null && clock >= tw.respawnAt && (prev.clock ?? 0) < tw.respawnAt && mem.once(g, `nexus-${t}-${tw.respawnAt}`)) {
        out.push({ kind: 'nexusRespawn', team: null, victim: t, at: tw.respawnAt });
      }
    }
  }

  // One drake from soul: a team's third drake, before anyone has the soul.
  for (const t of TEAMS) {
    if (!next.soul && next.teams[t].dragons.length === 3 && prev.teams[t].dragons.length < 3 && mem.once(g, `soulpt-${t}`)) {
      const n2 = next.nextDragon;
      out.push({ kind: 'soulPoint', team: t, at: clock, element: n2 && !n2.elder ? n2.element ?? undefined : undefined, secondsLeft: n2 ? Math.round(n2.at - clock) : undefined });
    }
  }

  // Gold.
  const bg = next.teams.B.gold, rg = next.teams.R.gold;
  if (bg !== null && rg !== null) for (const e of mem.gold(g, bg - rg)) out.push({ ...e, at: clock });

  // Players: deaths (a solo kill when one died, one enemy got the kill and nobody assisted), levels, first legendary.
  const pp = prev.players, np = next.players;
  if (pp && np) {
    const d = (s: MatchState['players'], t: Team, i: number, k: 'kills' | 'deaths' | 'assists') => (s![t][i]?.[k] ?? 0);
    const deaths: { t: Team; i: number }[] = [];
    for (const t of TEAMS) for (let i = 0; i < 5; i++) if (d(np, t, i, 'deaths') > d(pp, t, i, 'deaths')) deaths.push({ t, i });
    for (const x of deaths) {
      const by = other(x.t);
      const killers = [0, 1, 2, 3, 4].filter((i) => d(np, by, i, 'kills') > d(pp, by, i, 'kills'));
      const assists = [0, 1, 2, 3, 4].some((i) => d(np, by, i, 'assists') > d(pp, by, i, 'assists'));
      const solo = deaths.length === 1 && killers.length === 1 && !assists;
      const victim = np[x.t][x.i]!;
      out.push({ kind: 'kill', team: solo ? by : null, victim: x.t, at: clock, solo, player: solo ? np[by][killers[0]!]!.name : undefined, victimPlayer: victim.name });
    }
    for (const t of TEAMS) {
      np[t].forEach((p, i) => {
        const before = pp[t][i];
        if (!before || before.name !== p.name) return;
        for (const lv of [6, 11, 16]) {
          if ((p.level ?? 0) >= lv && (before.level ?? 0) < lv && mem.once(g, `lv${lv}-${t}-${p.name}`)) {
            out.push({ kind: lv === 6 ? 'level6' : 'level11', team: t, at: clock, n: lv, player: p.name, role: p.role });
          }
        }
        const leg = (p.items ?? []).find(legendaryItem);
        if (leg !== undefined && !(before.items ?? []).some(legendaryItem) && mem.once(g, `leg-${t}-${p.name}`)) {
          out.push({ kind: 'firstLegendary', team: t, at: clock, player: p.name, role: p.role, item: leg });
        }
      });
    }
  }
  return out;
}
