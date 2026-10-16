// Time helpers shared by every view. The service sends a snapshot every 5 s; between snapshots
// the clock and the countdowns keep moving from the moment the snapshot arrived.

import type { MatchState, Tower } from './types.ts';

/** Never run ahead of the last snapshot by more than this: a stalled service should look stalled. */
export const MAX_TICK_SEC = 20;

/** The game clock to draw now. */
export function clockNow(s: MatchState, receivedAt: number, now: number, tick: boolean): number | null {
  if (s.clock === null) return null;
  if (!tick || s.status !== 'in_game') return s.clock;
  return s.clock + Math.min(MAX_TICK_SEC, Math.max(0, (now - receivedAt) / 1000));
}

/** 1626 -> "27:06"; negative values clamp to "0:00". */
export function fmtClock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Seconds left until `at`, or null once it has passed or the clock is unknown. */
export function left(at: number, clock: number | null): number | null {
  if (clock === null) return null;
  const d = at - clock;
  return d > 0 ? d : null;
}

/** A tower is drawn as down unless it is a nexus turret whose respawn time has come in a live game. */
export function towerDown(t: Tower, s: MatchState, clock: number | null): boolean {
  if (!t.down) return false;
  if (s.status === 'in_game' && t.respawnAt !== null && clock !== null && clock >= t.respawnAt) return false;
  return true;
}

/** Countdowns only mean something while the game is on. */
export const timersOn = (s: MatchState) => s.status === 'in_game';
