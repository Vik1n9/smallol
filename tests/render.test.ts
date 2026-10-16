import { describe, expect, it } from 'vitest';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { clockNow, fmtClock, MAX_TICK_SEC } from '../src/model/clock.ts';
import { TEAMS, TOWER_SITES } from '../src/model/types.ts';
import { detectLang, LANGS, STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS, FEATURES } from '../src/settings/schema.ts';
import { mapSvg, towerAt } from '../src/render/map-svg.ts';
import { barView, dotView, fmtGold, mapView, tierOf, timerChips, type ViewCtx } from '../src/ui/views.ts';
import { settingsView } from '../src/ui/settings-view.ts';
import sample from '../fixtures/streamcv/state_finished_game.json' with { type: 'json' };

const finished = adapt(sample);
const live = { ...finished, status: 'in_game' as const };
const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  s: finished, clock: finished.clock, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], conn: 'ok', sample: false, ...over,
});
const opts = { inhibitors: true, unnamed: (n: number) => `+${n}?`, unnamedTitle: '', unknownTitle: '' };

describe('tower map', () => {
  it('draws 22 towers, with red\'s ten losses hollow', () => {
    const svg = mapSvg(finished, finished.clock, opts);
    expect(svg.match(/class="tower/g)).toHaveLength(22);
    expect(svg.match(/class="tower down"/g)).toHaveLength(10);
    expect(svg.match(/class="inhib down"/g)).toHaveLength(2);
  });

  it('puts every building at its own spot, blue bottom-left and red its mirror', () => {
    const spots = new Set(TEAMS.flatMap((t) => TOWER_SITES.map((s) => towerAt(t, s).join(','))));
    expect(spots.size).toBe(22);
    expect(towerAt('B', 'top_outer')[0]).toBeLessThan(20);
    expect(towerAt('R', 'top_outer')[1]).toBeLessThan(20);
    expect(towerAt('R', 'bot_outer')).toEqual([100 - towerAt('B', 'top_outer')[0], 100 - towerAt('B', 'top_outer')[1]]);
  });

  it('brings nexus turrets back at their respawn time in a live game', () => {
    expect(mapSvg(live, 30 * 60 + 15, opts).match(/class="tower down"/g)).toHaveLength(10);
    expect(mapSvg(live, 30 * 60 + 16, opts).match(/class="tower down"/g)).toHaveLength(8);
  });

  it('shows unknown towers as unknown, not as standing', () => {
    const s = adapt({ status: 'in_game' });
    expect(mapSvg(s, 0, opts)).toContain('class="map unknown"');
  });
});

describe('views', () => {
  it('picks the tier from the height', () => {
    expect([28, 43, 44, 119, 120, 400].map(tierOf)).toEqual(['dot', 'dot', 'bar', 'bar', 'map', 'map']);
  });

  it('shows kills, clock and gold lead on every tier', () => {
    for (const html of [dotView(ctx()), barView(ctx()), mapView(ctx(), true)]) {
      expect(html).toContain('22<span class="muted">:</span>8');
      expect(html).toContain('27:06');
      expect(html).toContain('+13.2k');
    }
  });

  it('hides each piece when its setting is off', () => {
    const off = Object.fromEntries(FEATURES.map((f) => [f, false])) as ViewCtx['show'];
    const html = mapView(ctx({ show: off }), true);
    expect(html).not.toContain('class="map');
    expect(html).not.toContain('27:06');
    expect(html).not.toContain('class="drake');
    expect(html).not.toContain('+13.2k');
  });

  it('runs countdowns only while the game is on', () => {
    expect(timerChips(ctx())).toBe('');
    const at = 27 * 60 + 6;
    const chips = timerChips(ctx({ s: live, clock: at }));
    // Two red inhibitors (2:42, 4:49) and both nexus turrets together (3:10), soonest first.
    expect(chips.match(/class="chip/g)).toHaveLength(3);
    expect([...chips.matchAll(/mono">(\d+:\d\d)</g)].map((m) => m[1])).toEqual(['2:42', '3:10', '4:49']);
    const html = mapView(ctx({ s: live, clock: at }), true);
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

describe('i18n', () => {
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

  it('settings page has a switch for every feature', () => {
    const html = settingsView(DEFAULTS, STRINGS.en, false);
    for (const f of FEATURES) expect(html).toContain(`data-toggle="show.${f}"`);
  });
});
