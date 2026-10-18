import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { Announced, deriveEvents, dueReminders, winnerOf } from '../src/events/derive.ts';
import { Dispatcher, replacesLine } from '../src/events/dispatch.ts';
import { channelOf, PRESETS, type GameEvent } from '../src/events/kinds.ts';
import { eventText } from '../src/events/text.ts';
import type { MatchState, Team } from '../src/model/types.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };
import day2draft from '../fixtures/streamcv/state_v04_kc_mvk_g2_waiting.json' with { type: 'json' };

const live = (): MatchState => ({ ...adapt(day2), status: 'in_game' });
const clone = (s: MatchState): MatchState => structuredClone(s);
const code = (t: Team) => (t === 'B' ? 'KC' : 'MVK');

describe('lane order', () => {
  it('a lane loses its outer turret first: a misnamed inner turret is moved to the front of the lane', () => {
    const raw = structuredClone(day2) as Record<string, unknown>;
    raw.towersLost = { B: [{ site: 'mid_inner', sec: 700, gameTime: '11:40' }], R: [] };
    const s = adapt(raw);
    expect(s.teams.B.towers.mid_outer).toMatchObject({ down: true, lostAt: 700 });
    expect(s.teams.B.towers.mid_inner.down).toBe(false);
  });
});

describe('event detection', () => {
  it('a tower falling is one event, named, and the screen reading taking it back and again is not a second', () => {
    const a = live();
    a.teams.R.towers.mid_outer.down = false;
    const b = clone(a); b.teams.R.towers.mid_outer.down = true; b.teams.R.towers.mid_outer.lostAt = 700;
    const seen = new Announced();
    const ev = deriveEvents(a, b, seen);
    expect(ev).toEqual([expect.objectContaining({ kind: 'tower', team: 'B', victim: 'R', lane: 'mid', tower: 'outer', at: 700 })]);
    expect(eventText(ev[0]!, code, 'zh-Hant').title).toBe('KC 推倒 MVK 中路外塔');
    expect(eventText(ev[0]!, code, 'en').title).toBe('KC topple MVK Mid outer');
    expect(deriveEvents(b, a, seen)).toEqual([]);
    expect(deriveEvents(a, b, seen)).toEqual([]);
  });

  it('a nexus turret is announced again only after it could have respawned', () => {
    const a = live();
    a.teams.R.towers.nexus_t1.down = false;
    const b = clone(a); b.teams.R.towers.nexus_t1.down = true; b.teams.R.towers.nexus_t1.lostAt = 1500;
    const seen = new Announced();
    expect(deriveEvents(a, b, seen)).toHaveLength(1);
    const c = clone(b); c.teams.R.towers.nexus_t1.lostAt = 1560;
    expect(deriveEvents(a, c, seen)).toHaveLength(0);
    const d = clone(b); d.teams.R.towers.nexus_t1.lostAt = 1700;
    expect(deriveEvents(a, d, seen)[0]).toMatchObject({ kind: 'nexusTower' });
  });

  it('drakes, baron, elder, soul, herald and grubs', () => {
    const a = live();
    a.teams.B.dragons = ['infernal']; a.teams.B.barons = 0; a.teams.B.elders = 0; a.soul = null; a.herald = { status: 'upcoming', at: null, team: null }; a.voidgrubs = { B: 1, R: 0 };
    const b = clone(a);
    b.teams.B.dragons = ['infernal', 'ocean']; b.teams.B.barons = 1; b.teams.B.elders = 1; b.soul = { team: 'B', element: 'ocean' };
    b.herald = { status: 'taken', at: 950, team: 'B' }; b.voidgrubs = { B: 3, R: 0 };
    const kinds = deriveEvents(a, b).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['drake', 'baron', 'elder', 'soul', 'herald', 'grubs']));
    const drake = deriveEvents(a, b).find((e) => e.kind === 'drake')!;
    expect(eventText(drake, code, 'zh-Hant').title).toBe('KC 拿下水龍（第 2 條）');
  });

  it('the draft: each ban and pick as it fills in, and the draft complete once all ten are locked', () => {
    const a = adapt(day2draft);
    const c = a.draft!.current!;
    c.sides.B.picks = ['Ziggs', null, null, null, null]; c.sides.R.picks = [null, null, null, null, null];
    const b = structuredClone(a);
    b.draft!.current!.sides.B.picks = ['Ziggs', 'Jayce', null, null, null];
    expect(deriveEvents(a, b).map((e) => [e.kind, e.champion])).toEqual([['pick', 'Jayce']]);
    const done = structuredClone(b);
    done.draft!.current!.sides.B.picks = ['Ziggs', 'Jayce', 'Mel', 'KSante', 'Leona'];
    done.draft!.current!.sides.R.picks = ['Rumble', 'Skarner', 'TwistedFate', 'MissFortune', 'Seraphine'];
    const ev = deriveEvents(b, done);
    expect(ev.filter((e) => e.kind === 'pick')).toHaveLength(8);
    expect(ev.at(-1)).toMatchObject({ kind: 'bpDone' });
    // The trade phase moves champions between slots: not new picks.
    const swapped = structuredClone(done);
    swapped.draft!.current!.sides.B.picks = ['KSante', 'Jayce', 'Mel', 'Ziggs', 'Leona'];
    expect(deriveEvents(done, swapped)).toEqual([]);
  });

  it('game start, game over with the winner from the nexus turrets, and the series when it is won', () => {
    const waiting = { ...live(), status: 'waiting' as const };
    expect(deriveEvents(waiting, live()).map((e) => e.kind)).toContain('gameStart');
    const end = live();
    end.status = 'finished';
    end.teams.R.towers.nexus_t1.down = true; end.teams.R.towers.nexus_t2.down = true;
    end.teams.B.towers.nexus_t1.down = false; end.teams.B.towers.nexus_t2.down = false;
    expect(winnerOf(end)).toBe('B');
    end.series = { ...end.series!, bestOf: 5, game: 3, teams: { B: { code: 'KC', wins: 2 }, R: { code: 'MVK', wins: 0 } } };
    const ev = deriveEvents(live(), end);
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining(['gameEnd', 'seriesEnd']));
    expect(eventText(ev.find((e) => e.kind === 'seriesEnd')!, code, 'zh-Hant').title).toBe('KC 贏下系列賽 3–0');
    expect(eventText(ev.find((e) => e.kind === 'seriesEnd')!, code, 'zh-Hant', true).title).toBe('KC 贏下系列賽');
  });

  it('an inhibitor read down, up, down again is announced once, until it could have respawned (batch 2c, F2)', () => {
    const a = live(); a.clock = 1500; a.teams.R.inhibitorsDown = [];
    const b = clone(a); b.clock = 1505; b.teams.R.inhibitorsDown = [{ lane: 'bot', respawnAt: 1805 }];
    const c = clone(b); c.clock = 1510; c.teams.R.inhibitorsDown = [];
    const d = clone(c); d.clock = 1515; d.teams.R.inhibitorsDown = [{ lane: 'bot', respawnAt: 1815 }];
    const seen = new Announced();
    const kinds = (p: MatchState, n: MatchState) => deriveEvents(p, n, seen).filter((e) => e.kind === 'inhibitor');
    expect(kinds(a, b)).toHaveLength(1);
    expect(kinds(b, c)).toEqual([]);
    expect(kinds(c, d)).toEqual([]);
    // Back up for real, and down again: a new one.
    const e = clone(d); e.clock = 1820; e.teams.R.inhibitorsDown = [];
    const f = clone(e); f.clock = 1900; f.teams.R.inhibitorsDown = [{ lane: 'bot', respawnAt: 2200 }];
    kinds(d, e);
    expect(kinds(e, f)).toHaveLength(1);
  });

  it('the end is never before the last thing that happened in the game (batch 2c, F3)', () => {
    const seen = new Announced();
    const a = live(); a.clock = 2175;
    a.teams.B.towers.nexus_t1.down = false;
    const b = clone(a); b.teams.B.towers.nexus_t1.down = true; b.teams.B.towers.nexus_t1.lostAt = 2185;
    expect(deriveEvents(a, b, seen).find((e) => e.kind === 'nexusTower')!.at).toBe(2185);
    const end = { ...clone(b), status: 'finished' as const };
    expect(deriveEvents(b, end, seen).find((e) => e.kind === 'gameEnd')!.at).toBe(2185);
  });

  it('the same game coming back from finished (a replay looping, a service restart) is not a new start', () => {
    const fin = { ...live(), status: 'finished' as const };
    expect(deriveEvents(fin, live()).map((e) => e.kind)).not.toContain('gameStart');
  });

  it('nothing on the first snapshot (the bar shows a baseline instead of replaying the game)', () => {
    expect(deriveEvents(null, live())).toEqual([]);
  });

  it('a match reminder once, inside the lead time', () => {
    const now = Date.parse('2026-10-18T17:46:00Z');
    const sched = { updated: null, matches: [{ matchId: 'm', start: Date.parse('2026-10-18T18:00:00Z'), state: 'unstarted' as const, stage: 'Play-Ins' as const, stageText: 'Play-Ins', bestOf: 5, teams: [{ code: 'KC', name: '' }, { code: 'MVK', name: '' }] as [{ code: string; name: string }, { code: string; name: string }], result: null }] };
    const done = new Set<string>();
    const ev = dueReminders(sched, now, 15, done);
    expect(ev).toHaveLength(1);
    expect(eventText(ev[0]!, code, 'zh-Hant')).toEqual({ title: '14 分鐘後開打 · KC vs MVK', sub: '入圍賽 BO5' });
    expect(dueReminders(sched, now + 60_000, 15, done)).toEqual([]);
  });
});

describe('dispatch', () => {
  const tower = (team: Team, site: 'outer' | 'inner', lane: 'top' | 'mid' | 'bot', at: number): GameEvent => ({ kind: 'tower', team, victim: team === 'B' ? 'R' : 'B', lane, tower: site, at });
  const cfg = { ...DEFAULTS };

  it('work mode: towers are strips, and a streak by one team updates one strip in place', () => {
    const d = new Dispatcher();
    const a = d.step([tower('R', 'outer', 'mid', 900)], 0, cfg, code, 'zh-Hant');
    const b = d.step([tower('R', 'inner', 'mid', 905)], 5_000, cfg, code, 'zh-Hant');
    expect(a.notices[0]).toMatchObject({ kind: 'strip', title: 'MVK 推倒 KC 中路外塔' });
    expect(b.notices[0]!.id).toBe(a.notices[0]!.id);
    expect(b.notices[0]!.title).toBe('MVK 連推 2 塔 · KC 中路內塔');
    expect(b.line!.text).toBe('MVK 連推 2 塔 · KC 中路內塔');
    // Past the gap, a new strip and a new count.
    const c = d.step([tower('R', 'outer', 'top', 990)], 60_000, cfg, code, 'zh-Hant');
    expect(c.notices[0]!.id).not.toBe(a.notices[0]!.id);
    expect(c.notices[0]!.title).toBe('MVK 推倒 KC 上路外塔');
  });

  it('cards of one step are one card; more than three cards a minute become strips', () => {
    const d = new Dispatcher();
    const baron: GameEvent = { kind: 'baron', team: 'B', at: 1500 };
    const inhib: GameEvent = { kind: 'inhibitor', team: 'B', victim: 'R', at: 1510, lane: 'mid' };
    const r = d.step([baron, inhib], 0, cfg, code, 'zh-Hant');
    expect(r.notices).toEqual([expect.objectContaining({ kind: 'card', title: 'KC 拿下巴龍', sub: 'KC 摧毀 MVK 中路水晶' })]);
    d.step([baron], 10_000, cfg, code, 'zh-Hant');
    d.step([baron], 20_000, cfg, code, 'zh-Hant');
    expect(d.step([baron], 30_000, cfg, code, 'zh-Hant').notices[0]!.kind).toBe('strip');
    expect(d.step([baron], 70_000, cfg, code, 'zh-Hant').notices[0]!.kind).toBe('card');
  });

  it('companion mode: what the broadcast shows goes to the log only; paused sends nothing', () => {
    const d = new Dispatcher();
    const r = d.step([{ kind: 'baron', team: 'B', at: 1500 }], 0, { ...cfg, mode: 'companion' }, code, 'zh-Hant');
    expect(r.notices).toEqual([]);
    expect(r.line?.text).toBe('KC 拿下巴龍');
    expect(new Dispatcher().step([{ kind: 'baron', team: 'B', at: 1500 }], 0, cfg, code, 'zh-Hant', true).notices).toEqual([]);
  });

  it('custom: the base preset with the user changes', () => {
    expect(channelOf('tower', { mode: 'custom', modeBase: 'major', custom: {} })).toBe(PRESETS.major.tower);
    expect(channelOf('tower', { mode: 'custom', modeBase: 'major', custom: { tower: 'card' } })).toBe('card');
    expect(channelOf('pick', { mode: 'work', modeBase: 'work', custom: { pick: 'off' } })).toBe('strip');
  });

  it('the log line holds against a smaller event for its level', () => {
    const cur = { level: 'major' as const, shownAt: 0 };
    expect(replacesLine(cur, 'normal', 10_000)).toBe(false);
    expect(replacesLine(cur, 'normal', 31_000)).toBe(true);
    expect(replacesLine(cur, 'major', 1_000)).toBe(true);
  });
});
