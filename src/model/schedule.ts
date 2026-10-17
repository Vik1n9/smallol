// The season schedule (service contract v0.6, "賽程與歷史"), for when no game is on.
// Scores live only in `result`, so spoiler-free views leave `result` out and nothing else.

export type MatchStage = 'Play-Ins' | 'Swiss' | 'Quarterfinals' | 'Semifinals' | 'Finals';

export interface ScheduleTeam {
  /** "TBD" until the team is known. */
  code: string;
  name: string;
}

export interface ScheduleMatch {
  matchId: string;
  /** Start time, ms since the epoch (the service sends UTC). */
  start: number;
  state: 'unstarted' | 'inProgress' | 'completed';
  /** null for a stage this version does not know; shown as the service wrote it. */
  stage: MatchStage | null;
  stageText: string;
  bestOf: number | null;
  teams: [ScheduleTeam, ScheduleTeam];
  /**
   * The pairing itself gives away an earlier result (lolesports' own isSpoiler flag, via the
   * service). null when the service did not say.
   */
  teamsSpoiler: boolean | null;
  /** Spoiler: series score and winner. null before the match. */
  result: { wins: [number, number]; winner: string | null } | null;
}

export interface Schedule {
  updated: string | null;
  matches: ScheduleMatch[];
}
