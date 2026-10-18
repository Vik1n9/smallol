// The event's teams: seeds, how they qualified, rosters and coaches (service contract v0.7,
// /teams.json). Hover cards, and the team and player profiles in the data window (UI_SPEC §6).

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
  /** Real name, and the name in the player's own script when it differs ("Kim Geon-bu", "김건부"). */
  realName: string | null;
  nativeName: string | null;
  debutYear: number | null;
  worldsYears: number[];
  /** Titles by competition, as the service names them ({"世界賽": 1, "MSI": 2, "LCK": 6}). */
  titles: Record<string, number>;
}

export interface RosterTeam {
  code: string;
  name: string;
  league: string | null;
  /** "Korea", "EMEA": the region a team plays in, for grouping. */
  region: string | null;
  /** The seed's number within its league, for ordering (1 first). */
  seed: number | null;
  /** "LCK #1". */
  seedLabel: string | null;
  startStage: string | null;
  qualificationPath: string | null;
  players: RosterPlayer[];
  coaches: { id: string; role: string | null; nationality: string | null }[];
}
