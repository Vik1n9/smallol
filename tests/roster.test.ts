import { describe, expect, it } from 'vitest';
import { adaptRoster, rosterPlayer, rosterUrl, starters } from '../src/data/streamcv/roster.ts';
import { adaptPlayers, adaptTeams } from '../src/data/streamcv/history.ts';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { adaptSchedule } from '../src/data/streamcv/schedule.ts';
import { ROLES } from '../src/model/types.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import { playerCard, playerShort, teamCard } from '../src/ui/roster-text.ts';
import { draftGameView, playersView, type ViewCtx } from '../src/ui/views.ts';
import { scheduleView } from '../src/ui/schedule-views.ts';
// The service's real /teams.json (StreamCV 5bd04c8, contract v0.7) and its history samples (5e3fe0b).
import teamsSample from '../fixtures/streamcv/teams.json' with { type: 'json' };
import historyTeams from '../fixtures/streamcv/history_teams.json' with { type: 'json' };
import historyPlayers from '../fixtures/streamcv/history_players.json' with { type: 'json' };
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };

const R = adaptRoster(teamsSample);
const S = STRINGS['zh-Hant'];

describe('teams.json (real sample)', () => {
  it('lives next to state.json', () => {
    expect(rosterUrl('http://127.0.0.1:8787/state.json')).toBe('http://127.0.0.1:8787/teams.json');
  });

  it('19 teams, 97 players; five starters a team, one per role, top to support', () => {
    expect(Object.keys(R)).toHaveLength(19);
    expect(Object.values(R).reduce((n, t) => n + t.players.length, 0)).toBe(97);
    for (const t of Object.values(R)) expect(starters(t).map((p) => p.role)).toEqual([...ROLES]);
  });

  it('keeps a player with a missing field, dropping only that field', () => {
    const all = Object.values(R).flatMap((t) => t.players);
    expect(all.filter((p) => p.age === null)).toHaveLength(1);
    expect(all.filter((p) => !p.bio)).toHaveLength(0);
  });

  it('finds players by team code and the name on screen, whatever the case', () => {
    expect(rosterPlayer(R, 'KC', 'Canna')!.nationality).toBe('韓國');
    expect(rosterPlayer(R, 'C9', 'loki')!.id).toBe('Loki');
    expect(rosterPlayer(R, 'KC', 'Nobody')).toBeNull();
    expect(rosterPlayer(R, null, 'Canna')).toBeNull();
  });

  it("games this event agree with the history sample's, player by player", () => {
    // The history sample is from 04:10 UTC on 10-17, teams.json from 22:35: MVK vs FUR (2 games)
    // was played in between, so those players are up to 2 games ahead (a substitute may not have
    // played them). Everyone else: the same number.
    const later: Record<string, number> = { MVK: 2, FUR: 2 };
    const H = adaptPlayers(historyPlayers);
    let checked = 0, ahead = 0;
    for (const t of Object.values(R)) {
      for (const p of t.players) {
        const h = H[`${t.code} ${p.id}`];
        if (!h) { expect(p.gamesThisWorlds).toBeNull(); continue; }
        const d = p.gamesThisWorlds! - h.games;
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(later[t.code] ?? 0);
        if (d) ahead++;
        checked++;
      }
    }
    expect(checked).toBe(21);
    expect(ahead).toBe(10); // the ten MVK and FUR players who played those two games
  });
});

describe('hover cards', () => {
  it("team card: name, seed, how it qualified, coaches", () => {
    expect(teamCard(S, R.KC!)).toBe('Karmine Corp · LEC #3\nLEC 2026 Summer Playoffs 3rd Place\n教練：Reapered（韓國）、Zeph（法國）');
  });

  it("player card: the service's bio, games this event; substitutes say so", () => {
    expect(playerCard(S, rosterPlayer(R, 'KC', 'Canna')!)).toBe('韓國，26 歲，2020 年出道，第 3 次打世界賽，LEC冠軍 ×1、LCK冠軍 ×1\n本屆上場 8 局');
    const sub = Object.values(R).flatMap((t) => t.players).find((p) => !p.starter)!;
    expect(playerCard(S, sub)).toContain('替補');
    expect(playerShort(S, rosterPlayer(R, 'KC', 'Canna')!)).toBe('韓國 26 歲');
  });
});

describe('views with the roster', () => {
  const live = adapt(day2);
  const history = { teams: adaptTeams(historyTeams), players: adaptPlayers(historyPlayers) };
  const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
    s: live, clock: live.clock, show: { ...DEFAULTS.show }, gold: 'diff', S, lang: 'zh-Hant', conn: 'ok', sample: false,
    schedule: null, now: 0, spoilerFree: true, history, pickedMatch: null, roster: R, ...over,
  });

  it('draft view: each team with its seed, and its card on hover', () => {
    const html = draftGameView(ctx());
    expect(html).toContain('<span class="seed">LEC #3</span>');
    expect(html).toContain('<span class="seed">LCP #3</span>');
    expect(html).toContain('title="Karmine Corp · LEC #3');
  });

  it('players view: all ten players of this game have a card', () => {
    const html = playersView(ctx());
    expect(html.match(/class="pn has-card"/g)).toHaveLength(10);
    expect(html).toContain('本屆上場 8 局');
    expect(playersView(ctx({ roster: null }))).not.toContain('has-card');
  });

  it("schedule, a match picked: both teams' five starters with nationality and age", () => {
    const sched = adaptSchedule({ matches: [{ matchId: 'x', start: '2026-10-23T17:00:00Z', state: 'unstarted', stage: 'Swiss', bestOf: 1,
      teams: [{ code: 'T1', name: 'T1' }, { code: 'KC', name: 'Karmine Corp' }], result: null }] });
    const html = scheduleView({ schedule: sched, now: 0, spoilerFree: true, S, lang: 'zh-Hant', timeZone: 'Asia/Taipei', history, picked: 'x', roster: R });
    expect(html.match(/class="tp"/g)).toHaveLength(10);
    expect(html).toContain('>Faker<');
    expect(html).toContain('>Canna<');
    expect(html).toContain('韓國 26 歲');
    expect(html).toContain('<span class="seed">LCK #3</span>');
    // T1 has no recorded games yet (Main Event): no tendencies, but its starters are there.
    expect(html).toContain('本屆還沒有記錄');
  });
});
