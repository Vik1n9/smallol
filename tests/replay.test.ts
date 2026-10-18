// Replays the service's recorded state log (Day 2/3, 11 games) through event detection and the
// dispatcher, and checks the acceptance line (docs/UI_SPEC_v1.md §8): in any 60 seconds, at most
// 4 strips (merged) and 3 cards, in both presets. The log is not in the repo (recorded data);
// set STATELOG to its path to run this, e.g.
//   STATELOG=P:/MyOpenSource/DesktopLOL-StreamCV/data/live_worlds2026/statelog.jsonl npx vitest run tests/replay.test.ts

import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { Announced, deriveEvents, winnerOf } from '../src/events/derive.ts';
import { deriveMore, Memory } from '../src/events/derive2.ts';
import { Dispatcher } from '../src/events/dispatch.ts';
import type { MatchState, Team } from '../src/model/types.ts';
import { DEFAULTS, type NotifyMode } from '../src/settings/schema.ts';

const path = process.env.STATELOG ?? '';
const rows = existsSync(path)
  ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((r) => String(r.updated) >= '2026-10-16T17' && !String(r.game ?? '').startsWith('1171338'))
  : [];

let unknownWinners = 0;
function run(mode: NotifyMode) {
  const d = new Dispatcher();
  const seen = new Announced();
  const mem = new Memory();
  let prev: MatchState | null = null;
  const perGame = new Map<string, { cards: number; strips: number; kinds: Record<string, number>; peakStrips: number; peakCards: number }>();
  const shown: { t: number; kind: 'card' | 'strip'; id: string; game: string }[] = [];
  for (const r of rows) {
    const s = adapt(r);
    const t = Date.parse(String(r.updated));
    const evs = [...deriveEvents(prev, s, seen), ...deriveMore(prev, s, mem)];
    if (prev?.status === 'in_game' && s.status === 'finished' && winnerOf(s) === null) unknownWinners++;
    const code = (x: Team) => s.series?.teams[x].code ?? x;
    const res = d.step(evs, t, { ...DEFAULTS, mode, myTeam: process.env.MYTEAM ?? null }, code, 'zh-Hant');
    const g = s.gameId ?? (s.series ? `${s.series.matchId}-${s.series.game}` : 'none');
    const st = perGame.get(g) ?? { cards: 0, strips: 0, kinds: {}, peakStrips: 0, peakCards: 0 };
    for (const e of evs) st.kinds[e.kind] = (st.kinds[e.kind] ?? 0) + 1;
    for (const n of res.notices) {
      // An update of a strip already on screen (a tower streak) is not a new strip.
      if (!shown.some((x) => x.id === n.id)) { shown.push({ t, kind: n.kind, id: n.id, game: g }); if (n.kind === 'card') st.cards++; else st.strips++; }
    }
    const win = shown.filter((x) => t - x.t < 60_000);
    st.peakStrips = Math.max(st.peakStrips, win.filter((x) => x.kind === 'strip').length);
    st.peakCards = Math.max(st.peakCards, win.filter((x) => x.kind === 'card').length);
    perGame.set(g, st);
    prev = s;
  }
  return perGame;
}

describe.skipIf(!rows.length)('replay of Day 2/3 (recorded state log)', () => {
  for (const mode of ['work', 'companion'] as const) {
    it(`${mode}: per game counts, and at most 3 cards and 4 strips in any minute`, () => {
      const games = [...run(mode)].filter(([g, st]) => g !== 'none' && (st.cards || st.strips || Object.keys(st.kinds).length));
      for (const [g, st] of games) console.log(mode, g.slice(-3), JSON.stringify(st));
      const real = games.filter(([, st]) => st.cards || st.strips > 1);
      const q = (k: 'cards' | 'strips' | 'peakStrips' | 'peakCards') => { const v = real.map(([, st]) => st[k]).sort((a, b) => a - b); return `${v[0]}/${v[Math.floor(v.length / 2)]}/${v[v.length - 1]}`; };
      console.log(`SUMMARY myTeam=${process.env.MYTEAM ?? '-'} ${mode}: games ${real.length} cards ${q('cards')} strips ${q('strips')} peak strips ${q('peakStrips')} peak cards ${q('peakCards')} (min/median/max)`);
      console.log(mode, 'games where the winner could not be told:', unknownWinners);
      unknownWinners = 0;
      expect(games.length).toBeGreaterThan(5);
      for (const [, st] of games) {
        expect(st.peakCards).toBeLessThanOrEqual(3);
        expect(st.peakStrips).toBeLessThanOrEqual(4);
      }
    });
  }
});
