// /teams.json -> rosters by team code. Defensive: a null field is dropped on its own (one player
// has no birthday), a broken player or team is skipped, the rest stays.

import { ROLES, type Role } from '../../model/types.ts';
import type { RosterPlayer, RosterTeam } from '../../model/roster.ts';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown, max = 200): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const text = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const ROLE_OF: Record<string, Role> = { top: 'top', jungle: 'jungle', mid: 'mid', bottom: 'bot', bot: 'bot', support: 'support' };

export const rosterUrl = (stateEndpoint: string) => new URL('teams.json', stateEndpoint).href;

function player(v: unknown): RosterPlayer | null {
  const o = obj(v);
  const id = text(o.id, 40);
  if (!id) return null;
  return {
    id, role: typeof o.role === 'string' ? ROLE_OF[o.role] ?? null : null, starter: o.starter === true,
    nationality: text(o.nationality, 20), age: count(o.age, 80), worldsAppearances: count(o.worldsAppearances, 30),
    gamesThisWorlds: count(o.gamesThisWorlds), bio: text(o.bio, 200),
  };
}

function team(v: unknown): RosterTeam | null {
  const o = obj(v);
  const code = text(o.code, 8);
  if (!code || !/^[A-Za-z0-9]+$/.test(code)) return null;
  const order = (r: Role | null) => (r ? ROLES.indexOf(r) : 9);
  return {
    code, name: text(o.name) ?? code, league: text(o.league, 20), seedLabel: text(o.seedLabel, 20),
    startStage: text(o.startStage, 30), qualificationPath: text(o.qualificationPath, 120),
    // Top to support; within a role the starter first, as the service lists them.
    players: arr(o.players).map(player).filter((p): p is RosterPlayer => p !== null)
      .map((p, i) => ({ p, i })).sort((a, b) => order(a.p.role) - order(b.p.role) || a.i - b.i).map((x) => x.p),
    coaches: arr(o.coaches).flatMap((c) => { const q = obj(c); const id = text(q.id, 40); return id ? [{ id, role: text(q.role, 30), nationality: text(q.nationality, 20) }] : []; }),
  };
}

export function adaptRoster(input: unknown): Record<string, RosterTeam> {
  const out: Record<string, RosterTeam> = {};
  for (const t of arr(obj(input).teams).map(team)) if (t) out[t.code] = t;
  return out;
}

/** A player by team code and the name on screen ("KC" + "Canna"). Case-insensitive, trimmed. */
export function rosterPlayer(roster: Record<string, RosterTeam> | null, code: string | null, shortName: string): RosterPlayer | null {
  if (!roster || !code) return null;
  const want = shortName.trim().toLowerCase();
  return roster[code]?.players.find((p) => p.id.toLowerCase() === want) ?? null;
}

/** The five starters, top to support. */
export const starters = (t: RosterTeam) => t.players.filter((p) => p.starter);
