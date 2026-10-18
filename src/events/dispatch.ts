// Turns the events of one step into what the user sees (docs/UI_SPEC_v1.md §2–3): the bar's log line,
// and cards and strips in the corner. Holds the little state the rules need (tower streaks, recent
// cards). Pure apart from that state: time comes in as an argument, so tests replay recorded games.

import type { Lang } from '../i18n/index.ts';
import type { Team } from '../model/types.ts';
import type { Settings } from '../settings/schema.ts';
import { channelOf, LEVEL, type EventKind, type GameEvent, type Level } from './kinds.ts';
import { eventText, streakText, towerLabel } from './text.ts';

/** One item in the notification window. Same id = update that item in place. */
export interface Notice {
  id: string;
  kind: 'card' | 'strip';
  title: string;
  sub?: string;
  /** The doer's side, for the colour bar; null = neutral (accent). */
  team: Team | null;
  /** "14:32", game time, when known. */
  time: string | null;
  /** The BP-complete card is taller (two lines of picks). */
  tall?: boolean;
  level: Level;
}

export interface LineUpdate {
  text: string;
  level: Level;
  team: Team | null;
  /** Game clock of the event, for the line's leading time. */
  at: number | null;
}

export interface StepResult {
  line: LineUpdate | null;
  notices: Notice[];
}

const TOWER_KINDS: readonly EventKind[] = ['tower', 'inhibTower', 'nexusTower'];
const RANK: Record<Level, number> = { major: 3, important: 2, normal: 1 };
/** R1: the next tower within this long joins the streak; one strip lives at most this long. */
export const STREAK_GAP_MS = 15_000, STREAK_LIFE_MS = 20_000;
/** Safety valve: at most this many cards a minute; more become strips. */
export const CARDS_PER_MIN = 3;

const fmt = (sec: number | null) => (sec === null ? null : `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, '0')}`);

interface Streak { id: string; n: number; startedAt: number; lastAt: number }

export class Dispatcher {
  private streaks = new Map<Team, Streak>();
  private cardTimes: number[] = [];
  private seq = 0;

  /** A new game: streaks do not carry over. */
  reset(): void { this.streaks.clear(); }

  step(events: GameEvent[], now: number, cfg: Pick<Settings, 'mode' | 'modeBase' | 'custom' | 'spoilerFree'>, code: (t: Team) => string, lang: Lang, paused = false): StepResult {
    const notices: Notice[] = [];
    let line: LineUpdate | null = null;
    const cards: Notice[] = [];
    const offerLine = (u: LineUpdate) => { if (!line || RANK[u.level] > RANK[line.level]) line = u; };
    for (const e of events) {
      const ch = channelOf(e.kind, cfg);
      if (ch === 'off') continue;
      const level = LEVEL[e.kind];
      let { title, sub } = eventText(e, code, lang, cfg.spoilerFree);
      let id = `e${this.seq++}`;
      // R1: towers by the same team in a row are one strip, counted, updated in place.
      if (TOWER_KINDS.includes(e.kind) && e.team) {
        const s = this.streaks.get(e.team);
        if (s && now - s.lastAt <= STREAK_GAP_MS) {
          s.n += 1; s.lastAt = now;
          if (now - s.startedAt > STREAK_LIFE_MS) { s.id = id; s.startedAt = now; } else id = s.id;
          title = streakText(code(e.team), s.n, towerLabel(e, code, lang), lang);
        } else {
          this.streaks.set(e.team, { id, n: 1, startedAt: now, lastAt: now });
        }
      }
      // R2: an inhibitor card says how many towers the streak has taken so far.
      if (e.kind === 'inhibitor' && e.team) {
        const s = this.streaks.get(e.team);
        if (s && now - s.lastAt <= STREAK_GAP_MS && s.n > 1) sub = lang === 'zh-Hant' ? `已連推 ${s.n} 塔` : `${s.n} turrets down`;
      }
      offerLine({ text: title, level, team: e.team, at: e.at });
      if (ch === 'log' || paused) continue;
      const n: Notice = { id, kind: ch, title, sub, team: e.team, time: fmt(e.at), level, tall: e.kind === 'bpDone' };
      if (ch === 'card') cards.push(n); else notices.push(n);
    }
    // R5: the cards of one step are one card, the most important first, the next as its note.
    if (cards.length) {
      cards.sort((a, b) => RANK[b.level] - RANK[a.level]);
      const head = cards[0]!;
      const card: Notice = cards.length > 1 && !head.tall ? { ...head, sub: head.sub ?? cards[1]!.title } : head;
      this.cardTimes = this.cardTimes.filter((t) => now - t < 60_000);
      if (this.cardTimes.length >= CARDS_PER_MIN) notices.push({ ...card, kind: 'strip', sub: undefined, tall: false });
      else { this.cardTimes.push(now); notices.push(card); }
    }
    return { line, notices };
  }
}

/** How long a line holds against a less important one (UI_SPEC §1). */
export const HOLD_MS: Record<Level, number> = { major: 30_000, important: 15_000, normal: 6_000 };

/** Whether a new line replaces the current one. */
export function replacesLine(cur: { level: Level; shownAt: number } | null, next: Level, now: number): boolean {
  if (!cur) return true;
  if (RANK[next] >= RANK[cur.level]) return true;
  return now - cur.shownAt >= HOLD_MS[cur.level];
}
