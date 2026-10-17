import { describe, expect, it } from 'vitest';
import { adaptPlayers, adaptTeams, findPlayer, historyUrl, kda, tally, teamPlayers } from '../src/data/streamcv/history.ts';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { adaptSchedule } from '../src/data/streamcv/schedule.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import { scheduleView, type ScheduleCtx } from '../src/ui/schedule-views.ts';
import { draftGameView, playersView, poolTitle, viewHeight, type ViewCtx } from '../src/ui/views.ts';
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };

// Hand-written in the shape of /history/teams.json and /history/players.json (contract v0.6),
// checked against real responses on 2026-10-17. The real history is not committed.
const g = (id: string, start: string, side: 'B' | 'R', opponent: string, win: boolean, bans: string[], picks: [string, string, string][]) =>
  ({ gameId: id, start, stage: 'Play-Ins', game: 1, side, opponent, win, bans, picks: picks.map(([role, player, champion]) => ({ role, player, champion })) });
const teamsRaw = {
  updated: '2026-10-17T04:00:00Z',
  teams: {
    KC: [
      g('1', '2026-10-15T18:16:34Z', 'B', 'C9', false, ['Vi', 'KSante', 'Nocturne', 'Orianna', 'Sylas'], [['top', 'KC Canna', 'Rumble'], ['jungle', 'KC Yike', 'LeeSin'], ['mid', 'KC kyeahoo', 'Syndra'], ['bottom', 'KC Caliste', 'Jhin'], ['support', 'KC Busio', 'Nautilus']]),
      g('2', '2026-10-15T19:10:00Z', 'R', 'C9', true, ['Nocturne', 'Vi', 'Azir', 'Rell', 'Ashe'], [['top', 'KC Canna', 'Jayce'], ['jungle', 'KC Yike', 'Viego'], ['mid', 'KC kyeahoo', 'Ahri'], ['bottom', 'KC Caliste', 'Ezreal'], ['support', 'KC Busio', 'Braum']]),
      g('3', '2026-10-16T18:20:00Z', 'B', 'MVK', true, ['Nocturne', 'Olaf', 'Vi', 'Yone', 'Pyke'], [['top', 'KC Canna', 'Jayce'], ['jungle', 'KC Yike', 'Vi'], ['mid', 'KC kyeahoo', 'Azir'], ['bottom', 'KC Caliste', 'Varus'], ['support', 'KC Busio', 'Rell']]),
    ],
    MVK: [g('3', '2026-10-16T18:20:00Z', 'R', 'KC', false, ['Pantheon', 'Karma', 'Orianna', 'Ryze', 'Jax'], [['top', 'MVK Kratos', 'Zaahen'], ['jungle', 'MVK Gury', 'JarvanIV'], ['mid', 'MVK Chika', 'KogMaw'], ['bottom', 'MVK Harky', 'Jhin'], ['support', 'MVK SiuLoong', 'Camille']])],
    'bad code!': [],
  },
};
const playersRaw = {
  updated: '2026-10-17T04:00:00Z',
  players: {
    'KC Canna': { team: 'KC', role: 'top', games: [{}, {}, {}], pool: { Rumble: { games: 1, wins: 0, k: 0, d: 4, a: 0 }, Jayce: { games: 2, wins: 2, k: 7, d: 5, a: 7 } } },
    'KC Busio': { team: 'KC', role: 'support', games: [{}, {}, {}], pool: { Nautilus: { games: 1, wins: 0, k: 0, d: 3, a: 2 }, Braum: { games: 1, wins: 1, k: 0, d: 1, a: 9 }, Rell: { games: 1, wins: 1, k: 1, d: 0, a: 12 } } },
    'MVK Kratos': { team: 'MVK', role: 'top', games: [{}], pool: { Zaahen: { games: 1, wins: 0, k: 2, d: 1, a: 5 } } },
  },
};
const teams = adaptTeams(teamsRaw);
const players = adaptPlayers(playersRaw);
const history = { teams, players };

describe('history adapters', () => {
  it('live next to state.json', () => {
    expect(historyUrl('http://127.0.0.1:8787/state.json', 'teams')).toBe('http://127.0.0.1:8787/history/teams.json');
    expect(historyUrl('http://127.0.0.1:8787/state.json', 'players')).toBe('http://127.0.0.1:8787/history/players.json');
  });

  it('read teams and players, dropping what does not fit', () => {
    expect(Object.keys(teams)).toEqual(['KC', 'MVK']);
    expect(teams.KC!.map((x) => x.gameId)).toEqual(['1', '2', '3']);
    expect(teams.KC![0]!.picks[3]).toEqual({ role: 'bot', player: 'KC Caliste', champion: 'Jhin' });
    expect(players['KC Canna']!.pool.map((e) => e.champion)).toEqual(['Jayce', 'Rumble']);
    expect(players['KC Canna']!.games).toBe(3);
  });

  it('tally: most banned and picked this event, most first', () => {
    expect(tally(teams.KC!, 'bans', 3)).toEqual([['Nocturne', 3], ['Vi', 3], ['Ashe', 1]]);
    expect(tally(teams.KC!, 'picks', 2)).toEqual([['Jayce', 2], ['Ahri', 1]]);
  });

  it('find a player by the name on screen and the team code', () => {
    expect(findPlayer(players, 'KC', 'Canna')!.name).toBe('KC Canna');
    expect(findPlayer(players, null, 'Canna')!.name).toBe('KC Canna');
    expect(findPlayer(players, 'KC', 'Nobody')).toBeNull();
    expect(teamPlayers(players, 'KC').map((p) => p.name)).toEqual(['KC Canna', 'KC Busio']);
    expect(kda({ k: 7, d: 5, a: 7 })).toBeCloseTo(2.8);
    expect(kda({ k: 1, d: 0, a: 12 })).toBe(13);
  });
});

const live = adapt(day2);
const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  s: live, clock: live.clock, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], lang: 'zh-Hant', conn: 'ok', sample: false,
  schedule: null, now: 0, spoilerFree: true, history, pickedMatch: null, ...over,
});

describe('draft view: this event', () => {
  it("adds each team's most banned and picked, with how often", () => {
    const html = draftGameView(ctx());
    expect(html).toContain('常禁');
    expect(html).toContain('夜曲<i>×3</i>');
    expect(html).toContain('杰西<i>×2</i>');
    expect(html).toContain('薩亨<i>×1</i>'); // MVK's one game
  });

  it('can be turned off, and the view gets shorter', () => {
    const show = { ...DEFAULTS.show, tendencies: false };
    expect(draftGameView(ctx({ show }))).not.toContain('常禁');
    expect(viewHeight('draftGame', show)).toBeLessThan(viewHeight('draftGame', DEFAULTS.show));
  });

  it('says so when a team has no recorded games, and stays quiet before history is read', () => {
    const noKC = { teams: { MVK: teams.MVK! }, players };
    expect(draftGameView(ctx({ history: noKC }))).toContain('本屆還沒有記錄');
    expect(draftGameView(ctx({ history: { teams: null, players: null } }))).not.toContain('常禁');
  });
});

describe('players view: champion pool on hover', () => {
  it('this champion and the whole pool; wins only when scores may show', () => {
    const t = poolTitle(ctx(), 'KC', 'Canna', 'Jayce');
    expect(t).toContain('本屆 杰西：2 場 · KDA 2.8');
    expect(t).toContain('杰西 2 場、藍寶 1 場');
    expect(t).not.toContain('勝');
    const open = poolTitle(ctx({ spoilerFree: false }), 'KC', 'Canna', 'Jayce');
    expect(open).toContain('杰西：2 場 2 勝');
    expect(open).toContain('藍寶 1 場 0 勝');
  });

  it('marks the champions that have a pool, on the real players', () => {
    const html = playersView(ctx());
    expect(html).toContain('class="pc has-pool"');
    expect(html.match(/has-pool/g)).toHaveLength(3); // the fixture's KC Canna, KC Busio and MVK Kratos all play in this real game
  });
});

describe('schedule: pick a match to see both teams', () => {
  const sched = adaptSchedule({ matches: [
    { matchId: 'm1', start: '2026-10-18T18:00:00Z', state: 'unstarted', stage: 'Play-Ins', bestOf: 5, teams: [{ code: 'TBD', name: 'TBD' }, { code: 'KC', name: 'Karmine Corp' }], result: null },
  ] });
  const sc = (over: Partial<ScheduleCtx> = {}): ScheduleCtx => ({ schedule: sched, now: 0, spoilerFree: true, S: STRINGS['zh-Hant'], lang: 'zh-Hant', timeZone: 'Asia/Taipei', history, picked: null, ...over });

  it('rows can be picked', () => {
    expect(scheduleView(sc())).toContain('data-match="m1"');
  });

  it("picked: each team's games, bans, picks and players' most played; TBD stays TBD", () => {
    const html = scheduleView(sc({ picked: 'm1' }));
    expect(html).toContain('← 賽程');
    expect(html).toContain('本屆 3 局');
    expect(html).toContain('夜曲<i>×3</i>');
    expect(html).toContain('<b>Canna</b>');
    expect(html).toContain('杰西<i>2</i>');
    expect(html).toContain('待定');
    expect(html).not.toContain('勝');
  });
});

// ---------- the service's real history (StreamCV 5e3fe0b): Worlds 2026 Play-In, 15 games ----------
import realTeams from '../fixtures/streamcv/history_teams.json' with { type: 'json' };
import realPlayers from '../fixtures/streamcv/history_players.json' with { type: 'json' };
import realGame from '../fixtures/streamcv/history_game.json' with { type: 'json' };

describe('real history samples, checked against each other and the live sample', () => {
  const T = adaptTeams(realTeams);
  const P = adaptPlayers(realPlayers);
  const state = adapt(day2);

  it('covers 15 games, 4 teams, 21 players', () => {
    expect(Object.keys(T).sort()).toEqual(['C9', 'FUR', 'KC', 'MVK']);
    expect(new Set(Object.values(T).flat().map((x) => x.gameId)).size).toBe(15);
    expect(Object.keys(P)).toHaveLength(21);
  });

  it('the history of this game (KC vs MVK game 2) is the draft the live sample showed', () => {
    for (const [code, side] of [['KC', 'B'], ['MVK', 'R']] as const) {
      const g = T[code]!.find((x) => x.gameId === state.gameId)!;
      expect(g.side).toBe(side);
      expect(g.bans).toEqual(state.draft!.current!.sides[side].bans);
      expect(g.picks.map((p) => p.champion)).toEqual(state.draft!.current!.sides[side].picks);
    }
  });

  it("the game review's final numbers are the live sample's", () => {
    expect(realGame.gameId).toBe(state.gameId);
    for (const t of ['B', 'R'] as const) {
      expect(realGame.final[t].kills).toBe(state.teams[t].kills);
      expect(realGame.final[t].gold).toBe(state.teams[t].gold);
      expect(realGame.final[t].towers).toBe(state.teams[t].towersDestroyed);
      expect(realGame.final[t].barons).toBe(state.teams[t].barons);
      // Voidgrubs and herald from Leaguepedia, against the service's own reading of the broadcast.
      expect(realGame.voidgrubs[t]).toBe(state.voidgrubs![t]);
    }
    expect(realGame.heralds.B).toBe(1);
    expect(state.herald!.team).toBe('B');
  });

  it('names are trimmed the same way everywhere (the service sent "C9 Loki ")', () => {
    expect(Object.keys(realPlayers.players)).toContain('C9 Loki ');
    expect(P['C9 Loki']).toBeDefined();
    expect(findPlayer(P, 'C9', 'Loki')!.name).toBe('C9 Loki');
  });

  it("each player's pool adds up to the games they appear in", () => {
    const appear = new Map<string, number>();
    for (const g of Object.values(T).flat()) for (const p of g.picks) appear.set(p.player, (appear.get(p.player) ?? 0) + 1);
    for (const p of Object.values(P)) {
      expect(p.pool.reduce((n, e) => n + e.games, 0)).toBe(p.games);
      expect(appear.get(p.name)).toBe(p.games);
    }
  });

  it('views: KC banned Nocturne 6 times in 8 games; the live players have pools', () => {
    const c = ctx({ history: { teams: T, players: P } });
    expect(T.KC).toHaveLength(8);
    expect(tally(T.KC!, 'bans', 1)).toEqual([['Nocturne', 6]]);
    expect(draftGameView(c)).toContain('夜曲<i>×6</i>');
    // All ten players of this game are in the history.
    expect(playersView(c).match(/has-pool/g)).toHaveLength(10);
    expect(poolTitle(c, 'KC', 'Canna', 'Galio')).toMatch(/^本屆 加里歐：\d+ 場 · KDA \d+\.\d/);
  });
});
