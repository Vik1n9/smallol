// Stream CV state.json -> MatchState. Pure and defensive: unknown values are dropped one by one,
// so one odd field never blanks the whole widget. Nothing outside src/data/ reads the raw JSON.

import {
  ELEMENTS, LANES, TEAMS, TOWER_SITES, other, isNexusTurret,
  type Buff, type Element, type GameStatus, type InhibitorDown, type Lane, type MatchState, type Team, type TeamState, type Tower, type TowerSite,
} from '../../model/types.ts';
import type { RawState } from './contract.ts';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v: unknown): number | null => { const n = num(v); return n !== null && n >= 0 ? Math.floor(n) : null; };
const team = (v: unknown): Team | null => (v === 'B' || v === 'R' ? v : null);
const element = (v: unknown): Element | null => ((ELEMENTS as readonly unknown[]).includes(v) ? (v as Element) : null);
const site = (v: unknown): TowerSite | null => ((TOWER_SITES as readonly unknown[]).includes(v) ? (v as TowerSite) : null);

/** "27:06" -> 1626. Minutes may run past 59 ("61:05"). */
export function parseClock(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A time given as seconds, or failing that as "M:SS". */
const time = (sec: unknown, text: unknown): number | null => num(sec) ?? parseClock(text);

const STATUSES: readonly GameStatus[] = ['idle', 'waiting', 'in_game', 'finished'];

function emptyTeam(): TeamState {
  const towers = Object.fromEntries(TOWER_SITES.map((s) => [s, { site: s, down: false, lostAt: null, respawnAt: null }])) as Record<TowerSite, Tower>;
  return { kills: null, gold: null, barons: null, elders: null, dragons: [], towersDestroyed: null, towers, unnamedLost: 0, inhibitorsDown: [] };
}

export function emptyState(status: GameStatus = 'idle'): MatchState {
  return {
    status, gameId: null, updated: null, clock: null, teams: { B: emptyTeam(), R: emptyTeam() }, towersKnown: false,
    riftElement: null, soul: null, nextDragon: null, nextBaron: null, buffs: [],
  };
}

/**
 * Which lanes the down inhibitors are in. An inhibitor can only fall after its lane's inhibitor
 * tower, so when exactly as many inhibitors are down as lanes have lost that tower, the lanes are
 * known. Which timer belongs to which lane is not, so the timers keep their own order.
 */
function placeInhibitors(t: TeamState, respawns: number[]): InhibitorDown[] {
  const sorted = [...respawns].sort((a, b) => a - b);
  const open = LANES.filter((l) => t.towers[`${l}_inhib_tower`].down);
  if (sorted.length === 0 || open.length !== sorted.length) return sorted.map((respawnAt) => ({ lane: null, respawnAt }));
  // Pair by time anyway (first tower lost, first respawn) so each lane gets one marker.
  const byLoss = [...open].sort((a, b) => (t.towers[`${a}_inhib_tower`].lostAt ?? 0) - (t.towers[`${b}_inhib_tower`].lostAt ?? 0));
  return sorted.map((respawnAt, i) => ({ lane: byLoss[i] as Lane, respawnAt }));
}

export function adapt(input: unknown): MatchState {
  const raw = obj(input) as RawState & Record<string, unknown>;
  const status = (STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as GameStatus) : 'idle';
  const s = emptyState(status);
  s.gameId = typeof raw.game === 'string' ? raw.game : null;
  s.updated = typeof raw.updated === 'string' ? raw.updated : null;
  if (status === 'idle') return s;
  s.clock = parseClock(raw.gameClock);

  const by = (field: unknown, t: Team) => obj(field)[t];
  for (const t of TEAMS) {
    const ts = s.teams[t];
    ts.kills = count(by(raw.kills, t));
    ts.gold = count(by(raw.gold, t));
    ts.barons = count(by(raw.barons, t));
    ts.elders = count(by(raw.elderKills, t));
    ts.towersDestroyed = count(by(raw.towersDestroyedBy, t));
    ts.dragons = arr(by(raw.dragons, t)).map(element).filter((e): e is Element => e !== null);
  }

  // Towers: which ones fell comes from screen reading (towersLost); nexus turrets also carry a respawn.
  const lost = obj(raw.towersLost);
  s.towersKnown = Array.isArray(lost.B) || Array.isArray(lost.R);
  for (const t of TEAMS) {
    for (const item of arr(lost[t])) {
      const o = obj(item);
      const at = site(o.site);
      if (!at) continue;
      const tower = s.teams[t].towers[at];
      tower.down = true;
      tower.lostAt = time(o.sec, o.gameTime);
    }
  }
  for (const item of arr(lost.nexusTurretsDown)) {
    const o = obj(item);
    const t = team(o.teamLost), at = site(o.site);
    if (!t || !at || !isNexusTurret(at)) continue;
    const tower = s.teams[t].towers[at];
    tower.down = true;
    tower.respawnAt = parseClock(o.respawnAt);
  }
  for (const t of TEAMS) {
    const named = Object.values(s.teams[t].towers).filter((x) => x.down).length;
    const destroyed = s.teams[other(t)].towersDestroyed;
    s.teams[t].unnamedLost = s.towersKnown && destroyed !== null ? Math.max(0, destroyed - named) : 0;
  }

  const timers = obj(raw.timers);
  const respawns: Record<Team, number[]> = { B: [], R: [] };
  for (const item of arr(timers.inhibitorsDown)) {
    const o = obj(item);
    const t = team(o.teamLost), at = parseClock(o.respawnAt);
    if (t && at !== null) respawns[t].push(at);
  }
  for (const t of TEAMS) s.teams[t].inhibitorsDown = placeInhibitors(s.teams[t], respawns[t]);

  const nd = obj(timers.nextDragon);
  const ndAt = time(nd.sec, nd.spawnAt);
  if (ndAt !== null) s.nextDragon = { elder: nd.kind === 'elder', element: element(nd.element), at: ndAt };
  const nb = obj(timers.nextBaron);
  const nbAt = time(nb.sec, nb.spawnAt);
  if (nbAt !== null) s.nextBaron = { at: nbAt };
  s.buffs = arr(timers.activeBuffs).flatMap((item): Buff[] => {
    const o = obj(item);
    const t = team(o.team), until = time(o.untilSec, o.until);
    const kind = o.buff === 'baron' || o.buff === 'elder' ? o.buff : null;
    return t && kind && until !== null ? [{ kind, team: t, until }] : [];
  });

  s.riftElement = element(raw.riftElement);
  const soul = obj(raw.soul);
  const soulTeam = team(soul.team), soulEl = element(soul.element);
  s.soul = soulTeam && soulEl ? { team: soulTeam, element: soulEl } : null;
  return s;
}
