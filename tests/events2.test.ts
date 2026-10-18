import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { deriveMore, Memory } from '../src/events/derive2.ts';
import { Dispatcher } from '../src/events/dispatch.ts';
import { eventText, milestoneText } from '../src/events/text.ts';
import type { MatchState, Team } from '../src/model/types.ts';
import { DEFAULTS } from '../src/settings/schema.ts';
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };
import day2draft from '../fixtures/streamcv/state_v04_kc_mvk_g2_waiting.json' with { type: 'json' };

const live = (): MatchState => ({ ...adapt(day2), status: 'in_game' });
const clone = (s: MatchState): MatchState => structuredClone(s);
const code = (t: Team) => (t === 'B' ? 'KC' : 'MVK');
const kinds = (a: MatchState, b: MatchState, m = new Memory()) => deriveMore(a, b, m).map((e) => e.kind);

describe('batch 2 detection', () => {
  it('a drake coming up is said once, inside the lead time, with its element', () => {
    const a = live(); a.clock = 600; a.nextDragon = { elder: false, element: 'infernal', elementSource: 'broadcast', at: 640 };
    const b = clone(a); b.clock = 615;
    const m = new Memory();
    const ev = deriveMore(a, b, m).filter((e) => e.kind === 'dragonSoon');
    expect(ev).toHaveLength(1);
    expect(eventText(ev[0]!, code, 'zh-Hant').title).toBe('火龍 25 秒後出現');
    const c = clone(b); c.clock = 620;
    expect(deriveMore(b, c, m).filter((e) => e.kind === 'dragonSoon')).toEqual([]);
  });

  it('an inhibitor back up, and one drake from soul', () => {
    const a = live(); a.clock = 1500; a.soul = null;
    a.teams.R.inhibitorsDown = [{ lane: 'mid', respawnAt: 1505 }];
    a.teams.B.dragons = ['infernal', 'ocean'];
    const b = clone(a); b.clock = 1506; b.teams.R.inhibitorsDown = []; b.teams.B.dragons = ['infernal', 'ocean', 'cloud'];
    b.nextDragon = { elder: false, element: 'hextech', elementSource: 'broadcast', at: 1806 };
    const ev = deriveMore(a, b, new Memory());
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining(['inhibRespawn', 'soulPoint']));
    expect(eventText(ev.find((e) => e.kind === 'inhibRespawn')!, code, 'zh-Hant').title).toBe('MVK 中路水晶重生');
    expect(eventText(ev.find((e) => e.kind === 'soulPoint')!, code, 'zh-Hant').title).toBe('KC 龍魂聽牌 · 海克斯龍 5:00');
  });

  it('a solo kill when one died, one enemy got the kill and nobody assisted; otherwise "down"', () => {
    const a = live();
    const b = clone(a);
    b.players!.R[2]!.deaths = (a.players!.R[2]!.deaths ?? 0) + 1;
    b.players!.B[2]!.kills = (a.players!.B[2]!.kills ?? 0) + 1;
    const solo = deriveMore(a, b, new Memory()).find((e) => e.kind === 'kill')!;
    expect(solo).toMatchObject({ solo: true, team: 'B', victim: 'R' });
    expect(eventText(solo, code, 'zh-Hant').title).toBe(`KC ${a.players!.B[2]!.name} 單殺 ${a.players!.R[2]!.name}`);
    const c = clone(b); c.players!.B[1]!.assists = (a.players!.B[1]!.assists ?? 0) + 1;
    const down = deriveMore(a, c, new Memory()).find((e) => e.kind === 'kill')!;
    expect(eventText(down, code, 'zh-Hant').title).toBe(`MVK ${a.players!.R[2]!.name} 倒下`);
  });

  it('gold: 5k once until the lead drops back under 3.5k; a lead change after a 3k lead', () => {
    const m = new Memory();
    const g = (diff: number) => m.gold('g', diff).map((e) => `${e.kind}:${e.team}`);
    expect(g(1000)).toEqual([]);
    expect(g(5200)).toEqual(['goldLead5k:B']);
    expect(g(4000)).toEqual([]);
    expect(g(5100)).toEqual([]);
    expect(g(3000)).toEqual([]);
    expect(g(5000)).toEqual(['goldLead5k:B']);
    expect(g(-200)).toEqual([]);
    expect(g(-1200)).toEqual(['goldFlip:R']);
  });

  it('level 6 and the first legendary, once per player', () => {
    const a = live();
    a.players!.B[0]!.level = 5; a.players!.B[0]!.items = [1055];
    const b = clone(a); b.players!.B[0]!.level = 6; b.players!.B[0]!.items = [1055, 3031];
    const m = new Memory();
    const ev = deriveMore(a, b, m);
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining(['level6', 'firstLegendary']));
    expect(eventText(ev.find((e) => e.kind === 'firstLegendary')!, code, 'zh-Hant').title).toBe(`KC ${a.players!.B[0]!.name} 首件成裝 · 無盡之刃`);
    expect(kinds(a, b, m)).toEqual([]);
  });

  it('the next draft beginning, once', () => {
    const fin = { ...live(), status: 'finished' as const };
    const w = adapt(day2draft);
    const m = new Memory();
    expect(kinds(fin, w, m)).toContain('bpStart');
    expect(kinds(fin, w, m)).not.toContain('bpStart');
  });
});

describe('batch 2 dispatch', () => {
  it('level 6 by several players close together is one strip, updated in place (companion)', () => {
    const d = new Dispatcher();
    const cfg = { ...DEFAULTS, mode: 'companion' as const };
    const lv = (team: Team, player: string, role: string) => ({ kind: 'level6' as const, team, at: 400, n: 6, player, role });
    const a = d.step([lv('B', 'Canna', 'top')], 0, cfg, code, 'zh-Hant');
    const b = d.step([lv('R', 'Kratos', 'mid'), lv('R', 'Gury', 'jungle')], 5_000, cfg, code, 'zh-Hant');
    expect(a.notices[0]!.kind).toBe('strip');
    expect(b.notices.at(-1)!.id).toBe(a.notices[0]!.id);
    expect(b.notices.at(-1)!.title).toBe('升 6 級 · KC 上 · MVK 野中');
    // Both teams in it: neutral colour, not the colour of whoever came last.
    expect(a.notices[0]!.team).toBe('B');
    expect(b.notices.at(-1)!.team).toBeNull();
  });

  it('merged milestones are grouped by team with every position, in both languages (batch 2b review)', () => {
    const who = [{ team: 'MVK', role: 'mid', player: 'Kratos' }, { team: 'FUR', role: 'support', player: 'JoJo' }, { team: 'MVK', role: 'jungle', player: 'Gury' }, { team: 'FUR', role: 'top', player: 'Guigo' }, { team: 'MVK', role: 'bot', player: 'Harky' }];
    expect(milestoneText('firstLegendary', who, 'zh-Hant')).toBe('首件成裝 · MVK 野中下 · FUR 上輔');
    expect(milestoneText('firstLegendary', who, 'en')).toBe('First item · MVK Jng Mid Bot · FUR Top Sup');
  });

  it('my team: a raised strip goes out only while fewer than 4 strips went out in the last minute; the rest stay in the log', () => {
    const d = new Dispatcher();
    const cfg = { ...DEFAULTS, mode: 'companion' as const, myTeam: 'KC' };
    // KC's drakes (important: raised from the log to a strip in companion), 16 s apart: four go out, the fifth in the same minute stays in the log.
    const drake = (n: number, at: number) => ({ kind: 'drake' as const, team: 'B' as Team, at, element: 'infernal' as const, n });
    for (let i = 0; i < 4; i++) expect(d.step([drake(i + 1, 100 + i * 16)], i * 16_000, cfg, code, 'zh-Hant').notices).toHaveLength(1);
    expect(d.step([drake(5, 155)], 55_000, cfg, code, 'zh-Hant').notices).toEqual([]);
    expect(d.held).toBe(1);
    // A minute on, there is room again.
    expect(d.step([drake(6, 200)], 70_000, cfg, code, 'zh-Hant').notices[0]!.kind).toBe('strip');
  });

  it('my team: an important event in the log becomes a strip; normal events and cards stay', () => {
    const tower = { kind: 'tower' as const, team: 'R' as Team, victim: 'B' as Team, lane: 'mid' as const, tower: 'outer' as const, at: 900 };
    expect(new Dispatcher().step([tower], 0, { ...DEFAULTS, myTeam: 'KC' }, code, 'zh-Hant').notices[0]!.kind).toBe('strip');
    const baron = { kind: 'baron' as const, team: 'B' as Team, at: 1500 };
    const watching = { ...DEFAULTS, mode: 'companion' as const, myTeam: 'KC' };
    expect(new Dispatcher().step([baron], 0, watching, code, 'zh-Hant').notices[0]!.kind).toBe('strip');
    expect(new Dispatcher().step([baron], 0, { ...watching, myTeam: 'T1' }, code, 'zh-Hant').notices).toEqual([]);
    expect(new Dispatcher().step([{ kind: 'level6' as const, team: 'B' as Team, at: 400, n: 6, player: 'Canna', role: 'top' }], 0, watching, code, 'zh-Hant').notices[0]!.kind).toBe('strip');
  });
});
