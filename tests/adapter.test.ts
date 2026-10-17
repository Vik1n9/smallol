import { describe, expect, it } from 'vitest';
import { adapt, parseClock } from '../src/data/streamcv/adapter.ts';
import { TOWER_SITES } from '../src/model/types.ts';
import { knownChampion } from '../src/data/champions.ts';
import sample from '../fixtures/streamcv/state_v03_mvk_fur_g3.json' with { type: 'json' };
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };
import day2draft from '../fixtures/streamcv/state_v04_kc_mvk_g2_waiting.json' with { type: 'json' };

const downSites = (s: ReturnType<typeof adapt>, t: 'B' | 'R') => TOWER_SITES.filter((x) => s.teams[t].towers[x].down);

describe('Stream CV adapter, real sample (Worlds 2026 Play-In MVK vs FUR G3, finished)', () => {
  const s = adapt(sample);

  it('reads status, clock and the feed totals', () => {
    expect(s.status).toBe('finished');
    expect(s.gameId).toBe('115660588583171785');
    expect(s.clock).toBe(27 * 60 + 6);
    expect(s.teams.B).toMatchObject({ kills: 22, gold: 59398, barons: 1, elders: 0, towersDestroyed: 10 });
    expect(s.teams.R).toMatchObject({ kills: 8, gold: 46224, barons: 0, elders: 0, towersDestroyed: 0 });
  });

  it('keeps the drakes in the order taken', () => {
    expect(s.teams.B.dragons).toEqual(['ocean', 'chemtech', 'chemtech']);
    expect(s.teams.R.dragons).toEqual(['hextech']);
    expect(s.riftElement).toBe('chemtech');
    expect(s.soul).toBeNull();
  });

  it('marks the ten towers red lost, and none of blue', () => {
    expect(s.towersKnown).toBe(true);
    expect(downSites(s, 'R')).toEqual(TOWER_SITES.filter((x) => x !== 'top_inhib_tower'));
    expect(downSites(s, 'B')).toEqual([]);
    expect(s.teams.R.towers.mid_inhib_tower.lostAt).toBe(1525);
    expect(s.teams.R.towers.nexus_t1).toMatchObject({ down: true, respawnAt: 30 * 60 + 16 });
  });

  it('agrees with the feed: named lost towers = towers the other side destroyed = tower events', () => {
    const towerEvents = (sample.events as { type: string; team: string }[]).filter((e) => e.type === 'tower');
    expect(downSites(s, 'R')).toHaveLength(s.teams.B.towersDestroyed!);
    expect(towerEvents.filter((e) => e.team === 'B')).toHaveLength(s.teams.B.towersDestroyed!);
    expect(s.teams.R.unnamedLost).toBe(0);
    // Inhibitors: two inhibitor events for blue, two red inhibitors down.
    expect(s.teams.R.inhibitorsDown).toHaveLength(sample.inhibitors.B);
  });

  it('places the down inhibitors in the lanes whose inhibitor tower fell', () => {
    // Red lost mid and bot inhibitor towers and two inhibitors, so those two lanes.
    expect(s.teams.R.inhibitorsDown.map((i) => i.lane).sort()).toEqual(['bot', 'mid']);
    expect(s.teams.R.inhibitorsDown.map((i) => i.respawnAt)).toEqual([29 * 60 + 48, 31 * 60 + 55]);
  });

  it('reads the objective timers', () => {
    expect(s.nextDragon).toEqual({ elder: false, element: 'chemtech', elementSource: null, at: 1868 });
    expect(s.nextBaron).toEqual({ at: 1711 });
    expect(s.buffs).toEqual([]);
  });
});

describe('Stream CV adapter, damaged input', () => {
  it('idle carries only status and time', () => {
    const s = adapt({ status: 'idle', updated: '2026-10-16T09:00:00Z' });
    expect(s.status).toBe('idle');
    expect(s.updated).toBe('2026-10-16T09:00:00Z');
    expect(s.towersKnown).toBe(false);
  });

  it('never throws, whatever arrives', () => {
    for (const junk of [null, undefined, 42, 'x', [], { status: 'in_game', kills: 'lots', dragons: { B: 'ocean' }, towersLost: { B: [null, 3, { site: 'moon' }] } }]) {
      expect(() => adapt(junk)).not.toThrow();
    }
    expect(adapt(null).status).toBe('idle');
  });

  it('drops what it does not know, one value at a time', () => {
    const s = adapt({
      status: 'in_game', gameClock: '12:3', kills: { B: 3, R: -1 },
      dragons: { B: ['ocean', 'elder', 'voidgrub', 'infernal'] },
      towersLost: { B: [{ site: 'top_outer', sec: 600 }, { site: 'moon' }] },
      timers: { activeBuffs: [{ buff: 'baron', team: 'R', until: '25:00' }, { buff: 'grubs', team: 'R', untilSec: 1 }], nextDragon: { kind: 'elder', spawnAt: '35:10' } },
      soul: { team: 'B', element: 'lava' },
    });
    expect(s.clock).toBeNull();
    expect(s.teams.B.kills).toBe(3);
    expect(s.teams.R.kills).toBeNull();
    expect(s.teams.B.dragons).toEqual(['ocean', 'infernal']);
    expect(s.teams.B.towers.top_outer).toMatchObject({ down: true, lostAt: 600 });
    expect(s.buffs).toEqual([{ kind: 'baron', team: 'R', until: 1500 }]);
    expect(s.nextDragon).toEqual({ elder: true, element: null, elementSource: null, at: 35 * 60 + 10 });
    expect(s.soul).toBeNull();
  });

  it('without screen reading, tower state is unknown, not "all standing"', () => {
    const s = adapt({ status: 'in_game', towersDestroyedBy: { B: 3, R: 1 } });
    expect(s.towersKnown).toBe(false);
    expect(s.teams.R.unnamedLost).toBe(0);
  });

  it('counts lost towers the screen reading has not named yet', () => {
    const s = adapt({ status: 'in_game', towersDestroyedBy: { B: 3 }, towersLost: { R: [{ site: 'bot_outer' }], B: [] } });
    expect(s.teams.R.unnamedLost).toBe(2);
  });

  it('leaves inhibitor lanes open when they cannot be told', () => {
    // One inhibitor down but two inhibitor towers gone: either lane.
    const s = adapt({
      status: 'in_game',
      towersLost: { R: [{ site: 'mid_inhib_tower' }, { site: 'bot_inhib_tower' }] },
      timers: { inhibitorsDown: [{ teamLost: 'R', respawnAt: '30:00' }] },
    });
    expect(s.teams.R.inhibitorsDown).toEqual([{ lane: null, respawnAt: 1800 }]);
  });

  it('parses clocks', () => {
    expect(parseClock('0:05')).toBe(5);
    expect(parseClock('61:05')).toBe(3665);
    expect(parseClock('1:5')).toBeNull();
    expect(parseClock(90)).toBeNull();
  });
});

describe('Stream CV adapter, series and draft (contract v0.1)', () => {
  it('real sample: Bo5 game 3, MVK blue vs FUR red, wins unknown, with the note why', () => {
    const s = adapt(sample);
    expect(s.series).toMatchObject({ bestOf: 5, game: 3, matchId: '115660588583040710', teams: { B: { code: 'MVK', wins: null }, R: { code: 'FUR', wins: null } } });
    expect(s.series!.winsNote).toBeTruthy();
  });

  it('real sample (v0.3): picks by role, bans in ban order, turn not supported yet', () => {
    const d = adapt(sample).draft!;
    expect(d).toMatchObject({ picksOrder: 'role', bansOrder: 'ban', bansSupported: true, turnSupported: false });
    expect(d.current!.sides.B.bans).toEqual(['Ezreal', 'Renata', 'Sylas', 'Poppy', 'Shen']);
    expect(d.current!.sides.R.bans).toEqual(['Locke', 'Nocturne', 'Yone', 'Orianna', 'Vayne']);
    const bans = [d.current!, ...d.earlier].flatMap((g) => [...g.sides.B.bans, ...g.sides.R.bans]);
    expect(bans).toHaveLength(30);
    expect(bans.filter((id) => !id || !knownChampion(id))).toEqual([]);
    expect(d.current!.sides.B).toMatchObject({ team: 'MVK', picks: ['Zaahen', 'JarvanIV', 'KogMaw', 'Jhin', 'Camille'] });
    expect(d.current!.sides.R.picks).toEqual(['KSante', 'Naafiri', 'Ryze', 'Kaisa', 'Leona']);
    expect(d.current!.turn).toBeNull();
    expect(d.earlier.map((g) => g.game)).toEqual([1, 2]);
    // Every champion id the service sends is one the name table knows (Data Dragon 16.20.1).
    const ids = [d.current!, ...d.earlier].flatMap((g) => [...g.sides.B.picks, ...g.sides.R.picks]);
    expect(ids).toHaveLength(30);
    expect(ids.filter((id) => !id || !knownChampion(id))).toEqual([]);
  });

  it('real sample: fearless holds, nothing picked twice in the series', () => {
    const d = adapt(sample).draft!;
    const ids = [d.current!, ...d.earlier].flatMap((g) => [...g.sides.B.picks, ...g.sides.R.picks]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('an old v0 file has neither: both stay null', () => {
    const { series, draft, ...v0 } = sample as Record<string, unknown>;
    expect(series && draft).toBeTruthy();
    const s = adapt(v0);
    expect(s.series).toBeNull();
    expect(s.draft).toBeNull();
  });

  it('reads series and draft when the service sends them', () => {
    const s = adapt({
      status: 'in_game',
      series: { bestOf: 5, game: 3, teams: { B: { code: 'T1', wins: 1 }, R: { code: 'GEN', wins: 1 } } },
      draft: {
        current: { game: 3, B: { team: 'T1', bans: ['Azir', null, 'bad name!'], picks: [] }, R: { team: 'GEN', bans: [], picks: ['Rell'] }, turn: { side: 'B', kind: 'pick', slot: 0 } },
        earlier: [{ game: 2, B: { team: 'GEN', picks: ['Vi'] }, R: { team: 'T1', picks: ['Jax'] } }, { game: 1, B: { team: 'T1' }, R: { team: 'GEN' } }, { game: 4, B: { team: 'T1' }, R: { team: 'GEN' } }],
      },
    });
    expect(s.series).toEqual({ bestOf: 5, game: 3, matchId: null, teams: { B: { code: 'T1', wins: 1 }, R: { code: 'GEN', wins: 1 } }, winsNote: null, sidesSource: null });
    // Without the v0.1 flags: the proposal's reading.
    expect(s.draft).toMatchObject({ picksOrder: 'draft', bansSupported: true, turnSupported: true });
    expect(s.draft!.current!.sides.B.bans).toEqual(['Azir', null, null, null, null]);
    expect(s.draft!.current!.sides.R.picks).toEqual(['Rell', null, null, null, null]);
    expect(s.draft!.current!.turn).toEqual({ side: 'B', kind: 'pick', slot: 0 });
    // Earlier games in order; a "later" game than the current one is dropped.
    expect(s.draft!.earlier.map((g) => g.game)).toEqual([1, 2]);
  });

  it('drops a series that does not add up', () => {
    expect(adapt({ status: 'in_game', series: { bestOf: 3, game: 4, teams: { B: { code: 'A' }, R: { code: 'B' } } } }).series).toBeNull();
    expect(adapt({ status: 'in_game', series: { bestOf: 3, game: 1, teams: { B: { code: 'way too long' }, R: { code: 'B' } } } }).series).toBeNull();
  });
});

describe('Stream CV adapter, contract v0.4 (Day 2, KC vs MVK game 2, real samples)', () => {
  const s = adapt(day2);

  it('reads voidgrubs, the top pit and the herald off the broadcast', () => {
    expect(s.voidgrubs).toEqual({ B: 1, R: 2 });
    expect(s.pitNext).toBe('baron');
    expect(s.herald).toEqual({ status: 'taken', at: 959, team: 'B' });
    expect(s.nextDragon).toEqual({ elder: false, element: 'chemtech', elementSource: 'broadcast', at: 2011 });
  });

  it('still agrees with the feed: named lost towers = towers the other side destroyed', () => {
    for (const t of ['B', 'R'] as const) {
      const named = TOWER_SITES.filter((x) => s.teams[t].towers[x].down).length;
      expect(named + s.teams[t].unnamedLost).toBe(s.teams[t === 'B' ? 'R' : 'B'].towersDestroyed);
    }
    expect(s.series).toMatchObject({ bestOf: 5, game: 2, teams: { B: { code: 'KC', wins: 1 }, R: { code: 'MVK', wins: 0 } } });
    for (const t of ['B', 'R'] as const) expect(s.players![t].reduce((a, p) => a + p.kills!, 0)).toBe(s.teams[t].kills);
  });

  it('mid-draft: sides from the broadcast, bans so far, no game yet', () => {
    const w = adapt(day2draft);
    expect(w.status).toBe('waiting');
    expect(w.series!.sidesSource).toBe('broadcast');
    expect(w.draft!.current!.sides.B).toMatchObject({ team: 'KC', bans: ['Olaf', 'Nocturne', 'Cassiopeia', 'MonkeyKing', null] });
    expect(w.draft!.current!.sides.R.bans).toEqual(['Pantheon', 'Karma', 'Orianna', null, null]);
    expect(w.draft!.current!.sides.B.picks).toEqual([null, null, null, null, null]);
    expect(w.draft!.earlier.map((g) => g.game)).toEqual([1]);
    expect(w.players).toBeNull();
    expect(w.clock).toBeNull();
    // What the finished game later showed: the draft so far is the start of the final bans.
    const final = adapt(day2).draft!.current!;
    expect(w.draft!.current!.sides.B.bans.slice(0, 4)).toEqual(final.sides.B.bans.slice(0, 4));
    expect(w.draft!.current!.sides.R.bans.slice(0, 3)).toEqual(final.sides.R.bans.slice(0, 3));
  });

  it('drops unknown values in the new fields', () => {
    const x = adapt({ status: 'in_game', voidgrubs: { B: 5, R: 'two' }, pitNext: 'dragon', herald: { status: 'gone' }, series: { bestOf: 3, game: 1, teams: { B: { code: 'A' }, R: { code: 'B' } }, sidesSource: 'guess' } });
    expect(x.voidgrubs).toEqual({ B: null, R: null });
    expect(x.pitNext).toBeNull();
    expect(x.herald).toBeNull();
    expect(x.series!.sidesSource).toBeNull();
  });
});
