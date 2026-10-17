import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { championName, knownChampion } from '../src/data/champions.ts';
import { itemName } from '../src/data/items.ts';
import { clockNow, fmtClock, MAX_TICK_SEC } from '../src/model/clock.ts';
import { TEAMS, TOWER_SITES } from '../src/model/types.ts';
import { detectLang, LANGS, STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS, FEATURES, VIEWS } from '../src/settings/schema.ts';
import { mapSvg, towerAt } from '../src/render/map-svg.ts';
import {
  barView, dotView, draftGameView, draftSeriesView, fmtGold, mapView, playersView, tabsView, tierOf, timerChips, viewHeight, type ViewCtx,
} from '../src/ui/views.ts';
import { settingsView } from '../src/ui/settings-view.ts';
import sample from '../fixtures/streamcv/state_v03_mvk_fur_g3.json' with { type: 'json' };
import day2 from '../fixtures/streamcv/state_v05_kc_mvk_g2.json' with { type: 'json' };
import day2draft from '../fixtures/streamcv/state_v04_kc_mvk_g2_waiting.json' with { type: 'json' };
import mock from '../fixtures/dev/series_draft_mock.json' with { type: 'json' };

const finished = adapt(sample);
/** The same game as the service sent it before v0.1: no series, no draft. */
const bare = { ...finished, series: null, draft: null, players: null, playersAsOf: null };
const live = { ...finished, status: 'in_game' as const };
const withMock = { ...adapt({ ...sample, ...mock }), status: 'in_game' as const };
const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  s: finished, clock: finished.clock, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], lang: 'zh-Hant',
  conn: 'ok', sample: false, schedule: null, now: 0, spoilerFree: true, ...over,
});
const opts = { inhibitors: true, inhibTimers: true, nexusTimers: true, unnamed: (n: number) => `+${n}?`, unnamedTitle: '', unknownTitle: '' };
const AT = 27 * 60 + 6;
const times = (html: string) => [...html.matchAll(/>(\d+:\d\d)</g)].map((m) => m[1]);

describe('tower map (2.5D)', () => {
  it("draws 22 towers, with red's ten losses as stumps", () => {
    const svg = mapSvg(finished, finished.clock, opts);
    expect(svg.match(/class="tower/g)).toHaveLength(22);
    expect(svg.match(/class="tower down"/g)).toHaveLength(10);
    expect(svg.match(/class="inhib down"/g)).toHaveLength(2);
    expect(svg.match(/class="nexus"/g)).toHaveLength(2);
  });

  it('puts every building at its own spot, blue bottom-left and red its mirror', () => {
    const spots = new Set(TEAMS.flatMap((t) => TOWER_SITES.map((s) => towerAt(t, s).join(','))));
    expect(spots.size).toBe(22);
    expect(towerAt('B', 'top_outer')[0]).toBeLessThan(20);
    expect(towerAt('R', 'top_outer')[1]).toBeLessThan(20);
    expect(towerAt('R', 'bot_outer')).toEqual([100 - towerAt('B', 'top_outer')[0], 100 - towerAt('B', 'top_outer')[1]]);
  });

  it('puts respawn countdowns on the buildings, only while the game is on', () => {
    expect(times(mapSvg(live, AT, opts)).sort()).toEqual(['2:42', '3:10', '4:49']);
    expect(times(mapSvg(finished, AT, opts))).toEqual([]);
    expect(times(mapSvg(live, AT, { ...opts, nexusTimers: false, inhibTimers: false }))).toEqual([]);
  });

  it('brings nexus turrets back at their respawn time in a live game', () => {
    expect(mapSvg(live, 30 * 60 + 15, opts).match(/class="tower down"/g)).toHaveLength(10);
    expect(mapSvg(live, 30 * 60 + 16, opts).match(/class="tower down"/g)).toHaveLength(8);
  });

  it('shows unknown towers as unknown, not as standing', () => {
    const svg = mapSvg(adapt({ status: 'in_game' }), 0, opts);
    expect(svg).toContain('class="map unknown"');
    expect(svg.match(/class="tower unknown"/g)).toHaveLength(22);
  });
});

describe('views', () => {
  it('picks the tier from the height without the views under the game', () => {
    expect([28, 49, 50, 121, 122, 400].map(tierOf)).toEqual(['dot', 'dot', 'bar', 'bar', 'map', 'map']);
  });

  it('shows kills, clock and gold lead on every tier', () => {
    for (const html of [dotView(ctx()), barView(ctx()), mapView(ctx(), true)]) {
      expect(html).toContain('<b>22</b><span class="muted">:</span><b>8</b>');
      expect(html).toContain('27:06');
      expect(html).toContain('+13.2k');
    }
  });

  it('says what each capsule counts, in words', () => {
    const html = mapView(ctx({ s: live, clock: AT }), true);
    for (const w of ['經濟', '巴龍', '下一隻']) expect(html).toContain(w);
    expect(html).toContain('>水<');
    expect(html).toContain('>化<');
  });

  it('hides each piece when its setting is off', () => {
    const off = Object.fromEntries(FEATURES.map((f) => [f, false])) as ViewCtx['show'];
    const html = mapView(ctx({ show: off }), true);
    expect(html).not.toContain('class="map');
    expect(html).not.toContain('27:06');
    expect(html).not.toContain('class="el');
    expect(html).not.toContain('+13.2k');
    expect(tabsView(ctx({ s: withMock, show: off }), DEFAULTS.views, false, false)).not.toContain('BO5');
  });

  it('lists countdowns as words only where the map does not show them', () => {
    const c = ctx({ s: live, clock: AT });
    expect(timerChips(c, true)).toBe('');
    const chips = timerChips(c, false);
    expect(chips.match(/class="chip/g)).toHaveLength(3);
    expect(times(chips)).toEqual(['2:42', '3:10', '4:49']);
    expect(chips).toContain('FUR 水晶');
    expect(chips).toContain('FUR 主堡塔');
    expect(timerChips(ctx({ s: { ...bare, status: 'in_game' }, clock: AT }), false)).toContain('紅方 水晶');
    expect(timerChips(ctx(), false)).toBe('');
  });

  it('counts down to the next dragon and baron, then says they are up', () => {
    const html = mapView(ctx({ s: live, clock: AT }), true);
    expect(html).toContain('4:02'); // next dragon 31:08
    expect(html).toContain('1:25'); // next baron 28:31
    expect(mapView(ctx({ s: live, clock: 28 * 60 + 40 }), true)).toContain(STRINGS['zh-Hant'].ui.baronUp);
  });

  it('formats gold and clocks', () => {
    expect([59398, 13174, 999, 0].map(fmtGold)).toEqual(['59.4k', '13.2k', '999', '0']);
    expect([0, 5, 1626, 3665, -3].map(fmtClock)).toEqual(['0:00', '0:05', '27:06', '61:05', '0:00']);
  });

  it('keeps the clock moving between snapshots, but not past a stalled service', () => {
    expect(clockNow(live, 0, 3000, true)).toBe(live.clock! + 3);
    expect(clockNow(live, 0, 3000, false)).toBe(live.clock);
    expect(clockNow(finished, 0, 3000, true)).toBe(finished.clock);
    expect(clockNow(live, 0, 600_000, true)).toBe(live.clock! + MAX_TICK_SEC);
  });

  it('says why there is nothing to show', () => {
    expect(dotView(ctx({ s: adapt({ status: 'idle' }) }))).toContain(STRINGS['zh-Hant'].status.idle);
    expect(barView(ctx({ s: adapt({ status: 'idle' }), conn: 'retrying' }))).toContain(STRINGS['zh-Hant'].connection.retrying);
  });
});

describe('tab strip and draft views', () => {
  it('shows best-of, game number and series score; or says there is no series data', () => {
    const tabs = tabsView(ctx({ s: withMock }), DEFAULTS.views, true, false);
    expect(tabs).toContain('BO5 第 3 局');
    expect(tabs).toContain('AAA 1–1 BBB');
    expect(tabsView(ctx({ s: bare }), DEFAULTS.views, true, false)).toContain(STRINGS['zh-Hant'].ui.noSeries);
    // Real sample: the service did not see the series before this game, so no score, and its note on hover.
    const real = tabsView(ctx(), DEFAULTS.views, true, false);
    expect(real).toContain('MVK <span class="muted">vs</span> FUR');
    expect(real).toContain(`title="${finished.series!.winsNote}"`);
    expect(tabsView(ctx({ s: withMock, S: STRINGS.en, lang: 'en' }), DEFAULTS.views, true, false)).toContain('Bo5 · Game 3');
  });

  it("lists this game's five bans and five picks per team, by name", () => {
    const html = draftGameView(ctx({ s: withMock }));
    expect(html.match(/class="ch ban"/g)).toHaveLength(10);
    expect(html.match(/class="ch pick"/g)).toHaveLength(10);
    expect(html).toContain('>賈克斯<');
    expect(draftGameView(ctx({ s: withMock, S: STRINGS.en, lang: 'en' }))).toContain('>Xin Zhao<');
  });

  it('marks whose turn it is and leaves open slots empty', () => {
    const s = adapt({ status: 'waiting', draft: { current: { game: 1, B: { team: 'AAA', bans: ['Ahri'] }, R: { team: 'BBB', bans: [] }, turn: { side: 'R', kind: 'ban', slot: 0 } } } });
    const html = draftGameView(ctx({ s }));
    expect(html.match(/class="ch empty now"/g)).toHaveLength(1);
    expect(html.match(/class="ch empty/g)).toHaveLength(19);
  });

  it('series view: every earlier pick, grouped by team, with the side it had that game', () => {
    const html = draftSeriesView(ctx({ s: withMock }));
    expect(html).toContain('已鎖 20 隻');
    expect(html.match(/class="ch pick"/g)).toHaveLength(20);
    expect(html.indexOf('>AAA<')).toBeLessThan(html.indexOf('>BBB<'));
    expect(draftSeriesView(ctx({ s: adapt({ status: 'in_game', draft: { current: { game: 1, B: { team: 'A' }, R: { team: 'B' } } } }) }))).toContain(STRINGS['zh-Hant'].ui.noEarlier);
  });

  it('says plainly when there is no draft data', () => {
    expect(draftGameView(ctx({ s: bare }))).toContain(STRINGS['zh-Hant'].ui.noDraft);
    expect(draftSeriesView(ctx({ s: bare }))).toContain(STRINGS['zh-Hant'].ui.noDraft);
  });

  it('real sample (v0.3): ten bans and ten picks by name, no position marks', () => {
    const html = draftGameView(ctx({ s: adapt(sample) }));
    expect(html.match(/class="ch pick"/g)).toHaveLength(10);
    expect(html.match(/class="ch ban"/g)).toHaveLength(10);
    expect(html).toContain('>伊澤瑞爾<');
    expect(html).toContain('>洛克<');
    expect(html).not.toContain('class="role');
  });

  it('bans: unsupported, missing for a whole game, or still coming during the draft', () => {
    const v01 = { ...finished, draft: { ...finished.draft!, bansSupported: false } };
    expect(draftGameView(ctx({ s: v01 }))).toContain(STRINGS['zh-Hant'].ui.bansUnsupported);
    expect(draftGameView(ctx())).not.toContain(STRINGS['zh-Hant'].ui.bansUnsupported);
    const none = adapt({ ...sample, draft: { ...sample.draft, current: { ...sample.draft.current, B: { ...sample.draft.current.B, bans: [null, null, null, null, null] } } } });
    const html = draftGameView(ctx({ s: none }));
    expect(html).toContain(STRINGS['zh-Hant'].ui.bansMissing);
    expect(html.match(/class="ch ban"/g)).toHaveLength(5);
    // During the draft, empty ban slots are just not decided yet.
    const live = adapt({ status: 'waiting', draft: { current: { game: 4, B: { team: 'MVK', bans: ['Ezreal', null] }, R: { team: 'FUR' } }, earlier: [], picksOrder: 'role', bansOrder: 'ban', bansSupported: true } });
    const during = draftGameView(ctx({ s: live }));
    expect(during).not.toContain(STRINGS['zh-Hant'].ui.bansMissing);
    expect(during.match(/class="ch ban"/g)).toHaveLength(1);
    expect(during.match(/class="ch empty/g)).toHaveLength(9);
    // During the draft (v0.1: picks only arrive once the game starts).
    const waiting = adapt({ status: 'waiting', draft: { current: { game: 4, B: { team: 'MVK' }, R: { team: 'FUR' } }, earlier: [], picksOrder: 'role', bansSupported: false } });
    expect(draftGameView(ctx({ s: waiting }))).toContain(STRINGS['zh-Hant'].ui.picksAtStart);
  });

  it('real sample: the series view locks the 20 picks of games 1 and 2', () => {
    const html = draftSeriesView(ctx());
    expect(html).toContain('已鎖 20 隻');
    expect(html.indexOf('>MVK<')).toBeLessThan(html.indexOf('>FUR<'));
  });

  it('the made-up layout data follows the fearless rule and names real champions', () => {
    const d = withMock.draft!;
    const earlier = new Set(d.earlier.flatMap((g) => TEAMS.flatMap((t) => g.sides[t].picks)));
    for (const t of TEAMS) for (const p of d.current!.sides[t].picks) expect(earlier.has(p)).toBe(false);
    const all = [d.current!, ...d.earlier].flatMap((g) => TEAMS.flatMap((t) => [...g.sides[t].picks, ...g.sides[t].bans]));
    expect(all.filter((id) => !id || !knownChampion(id))).toEqual([]);
  });

  it('shows an id it does not know as it is', () => {
    expect(championName('KSante', 'zh-Hant')).toBe('卡桑帝');
    expect(championName('KSante', 'en')).toBe("K'Sante");
    expect(championName('Newchamp', 'zh-Hant')).toBe('Newchamp');
  });
});

describe('i18n and settings page', () => {
  it('has the same keys in both languages', () => {
    const shape = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? shape(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(shape(STRINGS.en)).toEqual(shape(STRINGS['zh-Hant']));
    for (const l of LANGS) for (const f of FEATURES) expect(STRINGS[l].feature[f]).toBeTruthy();
  });

  it('picks the language from the locale', () => {
    expect(detectLang('zh-TW')).toBe('zh-Hant');
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });

  it('settings page has a switch for every feature and view', () => {
    const html = settingsView(DEFAULTS, STRINGS.en, false);
    for (const f of FEATURES) expect(html).toContain(`data-toggle="show.${f}"`);
    for (const v of VIEWS) expect(html).toContain(`data-toggle="views.${v}"`);
  });
});

describe('players view', () => {
  // Made-up numbers in the proposed shape (the service does not send players yet).
  const p = (role: string, name: string, champion: string, items: number[], extra: object = {}) =>
    ({ role, name, champion, level: 16, kills: 2, deaths: 1, assists: 5, cs: 230, gold: 11252, hp: 1500, maxHp: 3000, items, ...extra });
  const raw = {
    ...sample,
    players: {
      B: [p('support', 'MVK Five', 'Camille', [3363]), p('top', 'MVK One', 'Zaahen', [3078, 3363, 3111, 6631, 2055]), p('jungle', 'MVK Two', 'JarvanIV', []), p('mid', 'MVK Three', 'KogMaw', []), p('bottom', 'MVK Four', 'Jhin', [])],
      R: [p('top', 'FUR One', 'KSante', [], { hp: 0 }), p('jungle', 'FUR Two', 'Naafiri', []), p('mid', 'FUR Three', 'Ryze', []), p('bottom', 'FUR Four', 'Kaisa', []), p('support', 'FUR Five', 'Leona', [])],
    },
  };
  const s = adapt(raw);

  it('reads five a team, top to support, without the team tag in front of the name', () => {
    expect(s.players!.B.map((x) => x.role)).toEqual(['top', 'jungle', 'mid', 'bot', 'support']);
    expect(s.players!.B[0]).toMatchObject({ name: 'One', champion: 'Zaahen', kills: 2, gold: 11252, items: [3078, 3363, 3111, 6631, 2055] });
    const { players: _, ...v01 } = sample as Record<string, unknown>;
    expect(adapt(v01).players).toBeNull();
  });

  it('real sample (contract v0.2): each team of five adds up to the team totals', () => {
    const real = adapt(sample);
    expect(real.playersAsOf).toBe('2026-10-16T01:28:32.295Z');
    for (const t of TEAMS) {
      const ps = real.players![t];
      expect(ps.map((x) => x.role)).toEqual(['top', 'jungle', 'mid', 'bot', 'support']);
      expect(ps.reduce((a, x) => a + x.kills!, 0)).toBe(real.teams[t].kills);
      expect(ps.reduce((a, x) => a + x.gold!, 0)).toBe(real.teams[t].gold);
      expect(ps.map((x) => x.champion)).toEqual(real.draft!.current!.sides[t].picks);
    }
    expect(real.players!.B.map((x) => x.name)).toEqual(['Kratos', 'Gury', 'Chika', 'Harky', 'SiuLoong']);
    // Every item id the service sent has a name.
    const ids = TEAMS.flatMap((t) => real.players![t].flatMap((x) => x.items ?? []));
    expect(ids.length).toBeGreaterThan(40);
    expect(ids.filter((i) => itemName(i, 'en').startsWith('#'))).toEqual([]);
  });

  it('items the service could not read are said to be missing, not drawn as "no items"', () => {
    const s2 = adapt({ ...sample, players: { B: [{ role: 'top', name: 'MVK A', champion: 'Zaahen', items: null }], R: [] } });
    expect(s2.players!.B[0]!.items).toBeNull();
    expect(playersView(ctx({ s: s2 }))).toContain(STRINGS['zh-Hant'].ui.itemsUnknown);
  });

  it('shows position, name, champion, level, KDA, CS and gold; items by name without wards or potions', () => {
    const html = playersView(ctx({ s }));
    expect(html.match(/class="prow"/g)).toHaveLength(10);
    expect(html).toContain('>One<');
    expect(html).toContain('>薩亨<');
    expect(html).toContain('2/1/5');
    expect(html).toContain('11.3k');
    expect(html).toContain('三相之力 · 水星之靴 · 步履破壞者');
    expect(html).not.toContain('鷹眼晶球');
    expect(html).not.toContain('控域守衛');
    expect(html).toContain('style="width:50%"');
    expect(html).toContain('style="width:0%"');
  });

  it('item names are a switch of their own, and the view gets shorter without them', () => {
    const show = { ...DEFAULTS.show, playerItems: false };
    expect(playersView(ctx({ s, show }))).not.toContain('class="items"');
    expect(viewHeight('players', show)).toBeLessThan(viewHeight('players', DEFAULTS.show));
  });

  it('says plainly when the service sends no players', () => {
    expect(playersView(ctx({ s: bare }))).toContain(STRINGS['zh-Hant'].ui.noPlayers);
    expect(playersView(ctx())).not.toContain(STRINGS['zh-Hant'].ui.noPlayers);
  });
});

describe('views, contract v0.4', () => {
  const live2 = { ...adapt(day2), status: 'in_game' as const };
  const at2 = live2.clock!;

  it('shows each team its voidgrubs and barons in words', () => {
    const html = mapView(ctx({ s: live2, clock: at2 }), true);
    expect(html).toContain('三蟲</span>1');
    expect(html).toContain('三蟲</span>2');
    expect(mapView(ctx({ s: live2, clock: at2, show: { ...DEFAULTS.show, voidgrubs: false } }), true)).not.toContain('三蟲');
  });

  it('herald: a countdown to 15:00 while it is the pit\'s next, nothing once it is taken', () => {
    const early = { ...live2, pitNext: 'herald' as const, herald: { status: 'upcoming' as const, at: null, team: null } };
    expect(mapView(ctx({ s: early, clock: 14 * 60 }), true)).toContain('預示者</span><span class="mono">1:00');
    expect(mapView(ctx({ s: early, clock: 16 * 60 }), true)).toContain(STRINGS['zh-Hant'].ui.heraldMaybeUp);
    // While the pit's next is the herald, the baron countdown waits.
    expect(mapView(ctx({ s: early, clock: 14 * 60 }), true)).not.toContain('巴龍</span><span class="mono">');
  });

  it('herald taken (v0.5): the team that took it says so; unknown taker, nothing', () => {
    const html = mapView(ctx({ s: live2, clock: at2 }), true);
    expect(html.match(/預示者/g)).toHaveLength(2); // the label and its tooltip "預示者 15:59", once
    const rows = html.split('class="row team"');
    expect(rows[1]).toContain('預示者');
    expect(rows[2]).not.toContain('預示者');
    const unknown = { ...live2, herald: { ...live2.herald!, team: null } };
    expect(mapView(ctx({ s: unknown, clock: at2 }), true)).not.toContain('預示者');
    expect(mapView(ctx({ s: live2, clock: at2, show: { ...DEFAULTS.show, herald: false } }), true)).not.toContain('預示者');
  });

  it('marks a next-dragon element worked out from the rules', () => {
    const rules = { ...live2, nextDragon: { ...live2.nextDragon!, elementSource: 'rules' as const } };
    expect(mapView(ctx({ s: rules, clock: at2 }), true)).toContain(`class="guess" title="${STRINGS['zh-Hant'].ui.elementByRules}"`);
    expect(mapView(ctx({ s: live2, clock: at2 }), true)).not.toContain('class="guess"');
  });

  it('flags sides that may be swapped, on the tab and the draft', () => {
    const w = adapt(day2draft);
    expect(tabsView(ctx({ s: w }), DEFAULTS.views, true, false)).not.toContain(STRINGS['zh-Hant'].ui.sidesUnconfirmed);
    const unsure = { ...w, series: { ...w.series!, sidesSource: 'api_unconfirmed' as const } };
    expect(tabsView(ctx({ s: unsure }), DEFAULTS.views, true, false)).toContain(STRINGS['zh-Hant'].ui.sidesUnconfirmed);
    expect(draftGameView(ctx({ s: unsure }))).toContain(STRINGS['zh-Hant'].ui.sidesUnconfirmed);
  });

  it('mid-draft (real): bans so far, empty slots for the rest, picks to come', () => {
    const w = adapt(day2draft);
    const html = draftGameView(ctx({ s: w }));
    expect(html.match(/class="ch ban"/g)).toHaveLength(7);
    expect(html.match(/class="ch empty/g)).toHaveLength(3);
    expect(html.match(new RegExp(STRINGS['zh-Hant'].ui.picksAtStart, 'g'))).toHaveLength(2);
    expect(html).not.toContain(STRINGS['zh-Hant'].ui.bansMissing);
    expect(tabsView(ctx({ s: w }), DEFAULTS.views, true, false)).toContain('KC 1–0 MVK');
    expect(mapView(ctx({ s: w, clock: null }), true)).toContain(STRINGS['zh-Hant'].status.waiting);
  });
});
