// /schedule.json -> Schedule. Defensive like the state adapter: a match with a bad field is dropped,
// the rest still show. Also: where the endpoint is, and which match is next.

import type { MatchStage, Schedule, ScheduleMatch, ScheduleTeam } from '../../model/schedule.ts';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100 ? v : null);
const text = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

const STAGES: readonly MatchStage[] = ['Play-Ins', 'Swiss', 'Quarterfinals', 'Semifinals', 'Finals'];
const STATES: readonly ScheduleMatch['state'][] = ['unstarted', 'inProgress', 'completed'];

/** The schedule lives next to state.json on the same service. */
export function scheduleUrl(stateEndpoint: string): string {
  return new URL('schedule.json', stateEndpoint).href;
}

function team(v: unknown): ScheduleTeam | null {
  const o = obj(v);
  const code = text(o.code, 8);
  return code ? { code, name: text(o.name) ?? code } : null;
}

function match(v: unknown): ScheduleMatch | null {
  const o = obj(v);
  const matchId = text(o.matchId, 40);
  const start = typeof o.start === 'string' ? Date.parse(o.start) : NaN;
  const state = (STATES as readonly unknown[]).includes(o.state) ? (o.state as ScheduleMatch['state']) : null;
  const teams = arr(o.teams).map(team);
  if (!matchId || !Number.isFinite(start) || !state || teams.length !== 2 || !teams[0] || !teams[1]) return null;
  const r = obj(o.result);
  const wins = arr(r.wins).map(count);
  const result = wins.length === 2 && wins[0] !== null && wins[1] !== null
    ? { wins: [wins[0], wins[1]] as [number, number], winner: text(r.winner, 8) }
    : null;
  const stageText = text(o.stage) ?? '';
  return {
    matchId, start, state,
    stage: (STAGES as readonly string[]).includes(stageText) ? (stageText as MatchStage) : null, stageText,
    bestOf: count(o.bestOf), teams: [teams[0], teams[1]],
    teamsSpoiler: typeof o.teamsSpoiler === 'boolean' ? o.teamsSpoiler : null, result,
  };
}

export function adaptSchedule(input: unknown): Schedule {
  const o = obj(input);
  const matches = arr(o.matches).map(match).filter((m): m is ScheduleMatch => m !== null).sort((a, b) => a.start - b.start);
  return { updated: text(o.updated, 40), matches };
}

/** The match on now, or else the next one to start; null when the season is over. */
export function nextMatch(s: Schedule, now: number): ScheduleMatch | null {
  return s.matches.find((m) => m.state === 'inProgress')
    ?? s.matches.find((m) => m.state === 'unstarted' && m.start >= now - 3 * 3600_000)
    ?? null;
}

/** For the list: the last two finished matches, then everything still to come. */
export function listWindow(s: Schedule): ScheduleMatch[] {
  const firstOpen = s.matches.findIndex((m) => m.state !== 'completed');
  if (firstOpen < 0) return s.matches.slice(-5);
  return s.matches.slice(Math.max(0, firstOpen - 2));
}
