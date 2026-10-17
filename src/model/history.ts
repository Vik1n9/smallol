// This event's finished games, per team and per player (service contract v0.6, /history/*).
// Wins are spoilers: views leave them out while scores are hidden. Counts and KDA are not.
// Scope: only games the service recorded (Worlds 2026), so samples are small.

import type { Champion, Role, Team } from './types.ts';

export interface TeamGame {
  gameId: string;
  start: number;
  stage: string;
  game: number | null;
  side: Team | null;
  opponent: string | null;
  /** Spoiler. */
  win: boolean | null;
  /** In this team's own ban order. */
  bans: (Champion | null)[];
  picks: { role: Role | null; player: string; champion: Champion | null }[];
}

export interface PoolEntry {
  champion: Champion;
  games: number;
  /** Spoiler. */
  wins: number | null;
  k: number;
  d: number;
  a: number;
}

export interface PlayerHistory {
  /** As the service keys it, with the team code in front ("KC Canna"). */
  name: string;
  team: string | null;
  role: Role | null;
  games: number;
  /** Most played first. */
  pool: PoolEntry[];
}

export interface History {
  /** Per team code, oldest game first. */
  teams: Record<string, TeamGame[]> | null;
  /** Per player name as the service keys it. */
  players: Record<string, PlayerHistory> | null;
}
