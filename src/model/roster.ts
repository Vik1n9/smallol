// The event's teams: seeds, how they qualified, rosters and coaches (service contract v0.7,
// /teams.json). Shown as hover cards, not pages: the widget sits next to the broadcast.

import type { Role } from './types.ts';

export interface RosterPlayer {
  /** The in-game name without the team code ("Faker"); state.json has "T1 Faker". */
  id: string;
  role: Role | null;
  /** The first player listed for each role. */
  starter: boolean;
  nationality: string | null;
  age: number | null;
  worldsAppearances: number | null;
  /** Games this event as the service recorded them; null when none yet. */
  gamesThisWorlds: number | null;
  /** One line made only of the fields above (the service builds it; no free text). */
  bio: string | null;
}

export interface RosterTeam {
  code: string;
  name: string;
  league: string | null;
  /** "LCK #1". */
  seedLabel: string | null;
  startStage: string | null;
  qualificationPath: string | null;
  players: RosterPlayer[];
  coaches: { id: string; role: string | null; nationality: string | null }[];
}
