// The normalized game model. Renderers, settings views and tests only see these types; the raw
// Stream CV JSON stays inside src/data/streamcv/. All game times are seconds of game clock.

export type Team = 'B' | 'R';
export const TEAMS: readonly Team[] = ['B', 'R'];
export const other = (t: Team): Team => (t === 'B' ? 'R' : 'B');

export type Lane = 'top' | 'mid' | 'bot';
export const LANES: readonly Lane[] = ['top', 'mid', 'bot'];

/** The eleven towers each team owns (contract `site` values). */
export const TOWER_SITES = [
  'top_outer', 'top_inner', 'top_inhib_tower',
  'mid_outer', 'mid_inner', 'mid_inhib_tower',
  'bot_outer', 'bot_inner', 'bot_inhib_tower',
  'nexus_t1', 'nexus_t2',
] as const;
export type TowerSite = (typeof TOWER_SITES)[number];
export const isNexusTurret = (s: TowerSite) => s === 'nexus_t1' || s === 'nexus_t2';

/** Elemental drakes. The elder dragon is counted on its own (`TeamState.elders`). */
export const ELEMENTS = ['infernal', 'ocean', 'mountain', 'cloud', 'hextech', 'chemtech'] as const;
export type Element = (typeof ELEMENTS)[number];

export type GameStatus = 'idle' | 'waiting' | 'in_game' | 'finished';

export interface Tower {
  site: TowerSite;
  down: boolean;
  /** When it fell, when the service knows. */
  lostAt: number | null;
  /** Nexus turrets come back; the time it is due, by the rule table. */
  respawnAt: number | null;
}

export interface InhibitorDown {
  /** Inferred from which inhibitor towers are down; null when it cannot be told. */
  lane: Lane | null;
  respawnAt: number;
}

export interface TeamState {
  kills: number | null;
  gold: number | null;
  barons: number | null;
  elders: number | null;
  /** Elemental drakes in the order this team took them. */
  dragons: Element[];
  /** Towers this team destroyed (feed count, includes nexus turrets killed again). */
  towersDestroyed: number | null;
  /** This team's own towers. */
  towers: Record<TowerSite, Tower>;
  /** The feed says this team lost more towers than the screen reading has named yet. */
  unnamedLost: number;
  /** This team's own inhibitors that are down, soonest respawn first. */
  inhibitorsDown: InhibitorDown[];
}

export interface Buff {
  kind: 'baron' | 'elder';
  team: Team;
  until: number;
}

export interface NextDragon {
  elder: boolean;
  /** null while it cannot be known yet (before the rift element is set). */
  element: Element | null;
  at: number;
}

/** The series this game belongs to. Not in the service contract v0 (see docs/CONTRACT_PROPOSAL.md). */
export interface SeriesInfo {
  bestOf: number;
  /** 1-based number of this game in the series. */
  game: number;
  /** Who plays which side this game, and series wins before it. */
  teams: Record<Team, { code: string; wins: number }>;
}

/** A champion by its Data Dragon id ("KSante"); names come from src/data/champions.ts. */
export type Champion = string;

export interface DraftSide {
  /** Team code, so a series can follow a team across side swaps. */
  team: string;
  /** Five slots each, in draft order; null while not chosen yet. */
  bans: (Champion | null)[];
  picks: (Champion | null)[];
}

export interface DraftGame {
  game: number;
  sides: Record<Team, DraftSide>;
  /** The next action while the draft is on; null once it is done. */
  turn: { side: Team; kind: 'ban' | 'pick'; slot: number } | null;
}

export interface MatchState {
  status: GameStatus;
  gameId: string | null;
  /** Service time of this snapshot (ISO), for "last updated". */
  updated: string | null;
  /** Game clock at the snapshot. */
  clock: number | null;
  teams: Record<Team, TeamState>;
  /** Whether towers come from screen reading at all; false means tower state is unknown, not "all up". */
  towersKnown: boolean;
  riftElement: Element | null;
  soul: { team: Team; element: Element } | null;
  nextDragon: NextDragon | null;
  nextBaron: { at: number } | null;
  buffs: Buff[];
  series: SeriesInfo | null;
  /** This game's draft, and the earlier games of the series (fearless draft: their picks are locked). */
  draft: { current: DraftGame | null; earlier: DraftGame[] } | null;
}
