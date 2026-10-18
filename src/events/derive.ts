// Events from two snapshots of the game: what changed between the previous state and this one.
// Pure. The service sends a snapshot every 5 s; one step can carry several events (a fight that
// takes a tower and a drake). The first snapshot after the app starts has no "before": it yields
// nothing (the bar shows a baseline line instead of replaying the game so far).

import { other, TEAMS, TOWER_SITES, type Lane, type MatchState, type Team, type TowerSite } from '../model/types.ts';
import type { Schedule } from '../model/schedule.ts';
import type { GameEvent } from './kinds.ts';

const towerKind = (s: TowerSite): Pick<GameEvent, 'kind' | 'lane' | 'tower'> => {
  if (s === 'nexus_t1' || s === 'nexus_t2') return { kind: 'nexusTower', lane: null };
  const lane = s.split('_')[0] as Lane;
  if (s.endsWith('inhib_tower')) return { kind: 'inhibTower', lane };
  return { kind: 'tower', lane, tower: s.endsWith('outer') ? 'outer' : 'inner' };
};

/**
 * Who won a finished game. The state has no winner field (contract v0.9), so: the team that lost
 * both nexus turrets lost. Unknown when the screen reading missed them; the text then says
 * "game over" without a winner.
 */
export function winnerOf(s: MatchState): Team | null {
  if (s.status !== 'finished' || !s.towersKnown) return null;
  const lost = TEAMS.filter((t) => s.teams[t].towers.nexus_t1.down && s.teams[t].towers.nexus_t2.down);
  return lost.length === 1 ? other(lost[0]!) : null;
}

const allPicked = (s: MatchState) => {
  const c = s.draft?.current;
  return !!c && TEAMS.every((t) => c.sides[t].picks.length === 5 && c.sides[t].picks.every(Boolean));
};

/**
 * What was already announced this game. The screen reading revises towers (down, up again, down),
 * and a recorded game replayed through plain diffs announced 37 towers for one game (Day 2 G3):
 * a tower is announced once a game; a nexus turret again only after it could have respawned.
 */
export class Announced {
  private game: string | null = null;
  private towers = new Map<string, number>();
  /** Nexus turrets respawn 3:00 after falling; allow a second announcement after 2:30. */
  static readonly NEXUS_AGAIN_SEC = 150;
  fresh(game: string | null, key: string, at: number | null, nexus: boolean): boolean {
    if (game !== this.game) { this.game = game; this.towers.clear(); }
    const last = this.towers.get(key);
    if (last !== undefined && !(nexus && at !== null && at - last >= Announced.NEXUS_AGAIN_SEC)) return false;
    this.towers.set(key, at ?? 0);
    return true;
  }
}

export function deriveEvents(prev: MatchState | null, next: MatchState, seen: Announced = new Announced()): GameEvent[] {
  if (!prev) return [];
  const out: GameEvent[] = [];
  const at = next.clock;
  const gameNo = next.series?.game ?? next.draft?.current?.game;

  // The draft: a slot filling in, while the draft is on (picks swapped in the trade phase change
  // slot, they do not fill one; the feed's picks at game start are not new picks).
  const pc = prev.draft?.current, nc = next.draft?.current;
  if (next.status === 'waiting' && pc && nc && pc.game === nc.game) {
    for (const t of TEAMS) {
      nc.sides[t].bans.forEach((id, i) => { if (id && !pc.sides[t].bans[i]) out.push({ kind: 'ban', team: t, at: null, champion: id }); });
      nc.sides[t].picks.forEach((id, i) => { if (id && !pc.sides[t].picks[i] && !pc.sides[t].picks.includes(id)) out.push({ kind: 'pick', team: t, at: null, champion: id }); });
    }
    if (allPicked(next) && !allPicked(prev)) {
      out.push({ kind: 'bpDone', team: null, at: null, n: nc.game, picks: { B: nc.sides.B.picks as string[], R: nc.sides.R.picks as string[] } });
    }
  }

  // Not when the same game comes back from "finished" (a replay looping, the service restarting).
  const back = prev.status === 'finished' && prev.gameId === next.gameId;
  if (prev.status !== 'in_game' && next.status === 'in_game' && !back) out.push({ kind: 'gameStart', team: null, at, n: gameNo });

  // In-game changes only within one game.
  if (prev.gameId === next.gameId && next.gameId) {
    for (const owner of TEAMS) {
      const a = prev.teams[owner], b = next.teams[owner], by = other(owner);
      for (const site of TOWER_SITES) {
        if (!a.towers[site].down && b.towers[site].down) {
          const when = b.towers[site].lostAt ?? at;
          if (seen.fresh(next.gameId, `${owner}:${site}`, when, site === 'nexus_t1' || site === 'nexus_t2')) out.push({ ...towerKind(site), team: by, victim: owner, at: when });
        }
      }
      if (b.inhibitorsDown.length > a.inhibitorsDown.length) {
        const fresh = b.inhibitorsDown.filter((i) => !a.inhibitorsDown.some((j) => j.lane === i.lane && j.respawnAt === i.respawnAt));
        for (const i of fresh.slice(0, b.inhibitorsDown.length - a.inhibitorsDown.length)) out.push({ kind: 'inhibitor', team: by, victim: owner, at, lane: i.lane });
      }
    }
    for (const t of TEAMS) {
      const a = prev.teams[t], b = next.teams[t];
      for (let k = a.dragons.length; k < b.dragons.length; k++) out.push({ kind: 'drake', team: t, at, element: b.dragons[k]!, n: k + 1 });
      if ((b.elders ?? 0) > (a.elders ?? 0)) out.push({ kind: 'elder', team: t, at });
      if ((b.barons ?? 0) > (a.barons ?? 0)) out.push({ kind: 'baron', team: t, at });
      const ga = prev.voidgrubs?.[t] ?? 0, gb = next.voidgrubs?.[t] ?? 0;
      if (gb > ga) out.push({ kind: 'grubs', team: t, at, n: gb });
    }
    if (!prev.soul && next.soul) out.push({ kind: 'soul', team: next.soul.team, at, element: next.soul.element });
    if (!prev.herald?.team && next.herald?.team) out.push({ kind: 'herald', team: next.herald.team, at: next.herald.at ?? at });
  }

  if (prev.status === 'in_game' && next.status === 'finished') {
    const w = winnerOf(next);
    out.push({ kind: 'gameEnd', team: w, at, n: gameNo });
    const se = next.series;
    const before = w && se ? se.teams[w].wins : null;
    if (w && se && before !== null) {
      const need = Math.floor(se.bestOf / 2) + 1;
      if (before + 1 >= need) {
        const l = other(w), lw = se.teams[l].wins ?? 0;
        out.push({ kind: 'seriesEnd', team: w, at, score: [before + 1, lw] });
      }
    }
  }
  return out;
}

/** Matches starting within `leadMin` minutes that have not been announced yet. */
export function dueReminders(s: Schedule | null, now: number, leadMin: number, done: Set<string>): GameEvent[] {
  if (!s) return [];
  const out: GameEvent[] = [];
  for (const m of s.matches) {
    if (m.state !== 'unstarted' || done.has(m.matchId)) continue;
    const ms = m.start - now;
    // Due once inside the lead; a match already a while past its start is not announced late.
    if (ms <= leadMin * 60_000 && ms > -10 * 60_000) {
      done.add(m.matchId);
      out.push({ kind: 'reminder', team: null, at: null, minutes: Math.max(0, Math.round(ms / 60_000)), teams: [m.teams[0]?.code ?? 'TBD', m.teams[1]?.code ?? 'TBD'], stage: m.stage ?? m.stageText, n: m.bestOf ?? undefined });
    }
  }
  return out;
}
