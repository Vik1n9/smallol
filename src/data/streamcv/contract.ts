// The Stream CV service's state.json as documented in smallol-cv/docs/SERVICE_CONTRACT.md
// (v0, 2026-10-16). Everything is optional here: the adapter must survive a field that is missing,
// renamed or of the wrong type, because the service is young and v1 may add fields.

export type RawTeam = 'B' | 'R';
export type ByTeam<T> = { B?: T; R?: T };

export interface RawState {
  status?: string;
  game?: string;
  updated?: string;
  /** "missing": the official API says a game is on, but the official feed has had nothing for 2 minutes. */
  feed?: string;
  gameClock?: string;
  clockSource?: string;
  videoLagSec?: number;
  measuredLagSec?: number;
  dragons?: ByTeam<string[]>;
  riftElement?: string | null;
  soul?: { team?: string; element?: string } | null;
  elderKills?: ByTeam<number>;
  barons?: ByTeam<number>;
  /** Inhibitors each team destroyed. */
  inhibitors?: ByTeam<number>;
  kills?: ByTeam<number>;
  gold?: ByTeam<number>;
  /** Towers each team destroyed. */
  towersDestroyedBy?: ByTeam<number>;
  /** Towers each team lost, named by screen reading. */
  towersLost?: ByTeam<RawTowerLost[]> & {
    nexusTurretsDown?: { teamLost?: string; site?: string; respawnAt?: string }[];
    nexusRespawnsSeen?: unknown[];
  };
  timers?: {
    nextDragon?: { kind?: string; element?: string | null; elementNote?: string | null; spawnAt?: string; sec?: number } | null;
    nextBaron?: { spawnAt?: string; sec?: number } | null;
    activeBuffs?: { buff?: string; team?: string; until?: string; untilSec?: number }[];
    inhibitorsDown?: { teamLost?: string; respawnAt?: string }[];
    grubsWindow?: string;
    heraldWindow?: string;
    note?: string;
  };
  events?: { type?: string; team?: string; element?: string; sec?: number; gameTime?: string }[];
}

export interface RawTowerLost {
  site?: string;
  gameTime?: string;
  sec?: number;
}
