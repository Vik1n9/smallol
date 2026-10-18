// Turns the events of one step into what the user sees (docs/UI_SPEC_v1.md §2–3): the bar's log line,
// and cards and strips in the corner. Holds the little state the rules need (tower streaks, recent
// cards). Pure apart from that state: time comes in as an argument, so tests replay recorded games.

import type { Lang } from '../i18n/index.ts';
import type { Team } from '../model/types.ts';
import type { Settings } from '../settings/schema.ts';
import { channelOf, LEVEL, raise, type EventKind, type GameEvent, type Level } from './kinds.ts';
import { eventText, milestoneText, streakText, towerLabel } from './text.ts';

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
/**
 * My team's raised strips go out only while fewer strips than this went out in the last minute; the rest
 * stay in the log. 3, not 4: a raised strip cannot see the strips still to come that minute, and at 4
 * two replayed games reached 5 (batch 2c review).
 */
export const RAISE_BELOW = 3;

const fmt = (sec: number | null) => (sec === null ? null : `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, '0')}`);

interface Streak { id: string; n: number; startedAt: number; lastAt: number }
/** R3, R4: players reaching the same milestone within this long are one strip. */
export const MILESTONE_MS: Partial<Record<EventKind, number>> = { level6: 15_000, firstLegendary: 30_000 };
interface Gathering { id: string; startedAt: number; who: { team: string; role: string | null; player: string }[] }

export class Dispatcher {
  private streaks = new Map<Team, Streak>();
  private gatherings = new Map<EventKind, Gathering>();
  private cardTimes: number[] = [];
  /** Strips sent in the last minute, by id (an update in place does not count again). */
  private stripTimes: { id: string; t: number }[] = [];
  /** My team's events kept in the log by the strip limit, for replay numbers. */
  held = 0;
  private seq = 0;

  /** A new game: streaks do not carry over. */
  reset(): void { this.streaks.clear(); this.gatherings.clear(); }

  step(events: GameEvent[], now: number, cfg: Pick<Settings, 'mode' | 'modeBase' | 'custom' | 'spoilerFree'> & { myTeam?: string | null; milestones?: 'all' | 'mine' }, code: (t: Team) => string, lang: Lang, paused = false): StepResult {
    const notices: Notice[] = [];
    let line: LineUpdate | null = null;
    const cards: Notice[] = [];
    // Same level in one step: the last one wins, so the line matches the strip (a streak's latest tower).
    const offerLine = (u: LineUpdate) => { if (!line || RANK[u.level] >= RANK[line.level]) line = u; };
    for (const e of events) {
      let ch = channelOf(e.kind, cfg);
      if (ch === 'off') continue;
      // My team: an event it is part of goes one step up (log → strip → card).
      const mine = !!cfg.myTeam && ((e.team && code(e.team) === cfg.myTeam) || (e.victim && code(e.victim) === cfg.myTeam));
      const base = ch;
      if (mine) ch = raise(ch, LEVEL[e.kind]);
      const raised = ch !== base;
      // Milestones only for my team, when the user narrowed them (custom); the log still has them.
      if (cfg.milestones === 'mine' && MILESTONE_MS[e.kind] && !mine && ch !== 'log') ch = 'log';
      const level = LEVEL[e.kind];
      let { title, sub } = eventText(e, code, lang, cfg.spoilerFree);
      let id = `e${this.seq++}`;
      let side = e.team;
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
      // R3, R4: players reaching the same milestone close together are one strip, updated in place.
      const span = MILESTONE_MS[e.kind];
      if (span && e.team && e.player) {
        const gth = this.gatherings.get(e.kind);
        const who = { team: code(e.team), role: e.role ?? null, player: e.player };
        if (gth && now - gth.startedAt <= span) { gth.who.push(who); id = gth.id; }
        else this.gatherings.set(e.kind, { id, startedAt: now, who: [who] });
        const list = this.gatherings.get(e.kind)!.who;
        if (list.length > 1) title = milestoneText(e.kind as 'level6' | 'firstLegendary', list, lang);
        // Both teams in it: the neutral colour, not the colour of whoever came last (it flipped in place).
        if (new Set(list.map((w) => w.team)).size > 1) side = null;
      }
      // R2: an inhibitor card says how many towers the streak has taken so far.
      if (e.kind === 'inhibitor' && e.team) {
        const s = this.streaks.get(e.team);
        if (s && now - s.lastAt <= STREAK_GAP_MS && s.n > 1) sub = [lang === 'zh-Hant' ? `已連推 ${s.n} 塔` : `${s.n} turrets down`, sub].filter(Boolean).join(' · ');
      }
      offerLine({ text: title, level, team: e.team, at: e.at });
      if (raised && ch === 'strip' && !paused) {
        this.stripTimes = this.stripTimes.filter((x) => now - x.t < 60_000);
        if (!this.stripTimes.some((x) => x.id === id) && this.stripTimes.length >= RAISE_BELOW) { ch = 'log'; this.held++; }
      }
      if (ch === 'log' || ch === 'off' || paused) continue;
      if (ch === 'strip') this.sentStrip(id, now);
      const n: Notice = { id, kind: ch, title, sub, team: side, time: fmt(e.at), level, tall: e.kind === 'bpDone' };
      if (ch === 'card') cards.push(n); else notices.push(n);
    }
    // R5: the cards of one step are one card, the most important first, the next as its note.
    if (cards.length) {
      cards.sort((a, b) => RANK[b.level] - RANK[a.level]);
      const head = cards[0]!;
      const card: Notice = cards.length > 1 && !head.tall ? { ...head, sub: head.sub ?? cards[1]!.title } : head;
      this.cardTimes = this.cardTimes.filter((t) => now - t < 60_000);
      if (this.cardTimes.length >= CARDS_PER_MIN) { notices.push({ ...card, kind: 'strip', sub: undefined, tall: false }); this.sentStrip(card.id, now); }
      else { this.cardTimes.push(now); notices.push(card); }
    }
    return { line, notices };
  }

  private sentStrip(id: string, now: number): void {
    if (!this.stripTimes.some((x) => x.id === id)) this.stripTimes.push({ id, t: now });
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
