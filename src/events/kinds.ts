// What can happen in a game, how much it matters, and where each preset sends it (docs/UI_SPEC_v1.md §3).
// Batch 1: the kinds the service reports today. Pure data and lookups.

import type { Channel, NotifyBase, Settings } from '../settings/schema.ts';
import type { Element, Lane, Team } from '../model/types.ts';

export const EVENT_KINDS = [
  'reminder', 'ban', 'pick', 'bpDone', 'gameStart', 'gameEnd', 'seriesEnd',
  'tower', 'inhibTower', 'nexusTower', 'inhibitor',
  'drake', 'herald', 'grubs', 'soul', 'elder', 'baron',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** How much it matters: how long it holds the log line, and whether the bar glows (§1). */
export type Level = 'major' | 'important' | 'normal';

export interface GameEvent {
  kind: EventKind;
  /** The team that did it (took the drake, pushed the tower); null for neutral events. */
  team: Team | null;
  /** The team it happened to (lost the tower or inhibitor). */
  victim?: Team;
  /** Game clock (seconds), when known. */
  at: number | null;
  /** Kind-specific details. */
  lane?: Lane | null;
  tower?: 'outer' | 'inner';
  element?: Element;
  /** The team's nth drake, total grubs, the game number. */
  n?: number;
  champion?: string;
  /** Series score after the game, for seriesEnd. */
  score?: [number, number];
  /** Picks per side for bpDone, in slot order. */
  picks?: Record<Team, string[]>;
  /** Reminder: minutes to go, and the two teams. */
  minutes?: number;
  teams?: [string, string];
  stage?: string;
}

export const LEVEL: Record<EventKind, Level> = {
  reminder: 'major', ban: 'normal', pick: 'normal', bpDone: 'important',
  gameStart: 'major', gameEnd: 'major', seriesEnd: 'major',
  tower: 'normal', inhibTower: 'important', nexusTower: 'important', inhibitor: 'major',
  drake: 'important', herald: 'important', grubs: 'normal', soul: 'major', elder: 'major', baron: 'major',
};

/** Work: not watching, the app is the game. Companion: watching, only what the broadcast does not say. */
export const PRESETS: Record<NotifyBase, Record<EventKind, Channel>> = {
  work: {
    reminder: 'card', ban: 'log', pick: 'strip', bpDone: 'card', gameStart: 'card', gameEnd: 'card', seriesEnd: 'card',
    tower: 'strip', inhibTower: 'strip', nexusTower: 'strip', inhibitor: 'card',
    drake: 'strip', herald: 'strip', grubs: 'log', soul: 'card', elder: 'card', baron: 'card',
  },
  companion: {
    reminder: 'card', ban: 'log', pick: 'log', bpDone: 'log', gameStart: 'log', gameEnd: 'log', seriesEnd: 'log',
    tower: 'log', inhibTower: 'log', nexusTower: 'log', inhibitor: 'log',
    drake: 'log', herald: 'log', grubs: 'log', soul: 'log', elder: 'log', baron: 'log',
  },
  major: {
    reminder: 'card', ban: 'off', pick: 'off', bpDone: 'log', gameStart: 'card', gameEnd: 'card', seriesEnd: 'card',
    tower: 'log', inhibTower: 'log', nexusTower: 'log', inhibitor: 'card',
    drake: 'log', herald: 'log', grubs: 'off', soul: 'card', elder: 'card', baron: 'card',
  },
};

/** Where this event goes under the user's settings. */
export function channelOf(kind: EventKind, s: Pick<Settings, 'mode' | 'modeBase' | 'custom'>): Channel {
  if (s.mode !== 'custom') return PRESETS[s.mode][kind];
  return s.custom[kind] ?? PRESETS[s.modeBase][kind];
}
