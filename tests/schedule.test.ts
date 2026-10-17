import { describe, expect, it } from 'vitest';
import { adaptSchedule, listWindow, nextMatch, scheduleUrl } from '../src/data/streamcv/schedule.ts';
import { adapt } from '../src/data/streamcv/adapter.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS, normalize } from '../src/settings/schema.ts';
import { fmtStart, nextMatchCard, nextMatchLine, scheduleView, type ScheduleCtx } from '../src/ui/schedule-views.ts';
import { dotView, mapView, tabsView, type ViewCtx } from '../src/ui/views.ts';

// Hand-written in the shape of the service's /schedule.json (contract v0.6), checked against a real
// response on 2026-10-17. The real schedule is official data and is not committed.
const raw = {
  updated: '2026-10-17T04:00:00Z',
  matches: [
    { matchId: '2', start: '2026-10-16T23:00:00Z', state: 'completed', stage: 'Play-Ins', bestOf: 5,
      teams: [{ code: 'FUR', name: 'FURIA', image: 'http://x/logo.png' }, { code: 'C9', name: 'Cloud9 Kia' }], teamsSpoiler: true, result: { wins: [3, 1], winner: 'FUR' } },
    { matchId: '1', start: '2026-10-15T18:00:00Z', state: 'completed', stage: 'Play-Ins', bestOf: 5,
      teams: [{ code: 'KC', name: 'Karmine Corp' }, { code: 'C9', name: 'Cloud9 Kia' }], teamsSpoiler: false, result: { wins: [3, 2], winner: 'KC' } },
    { matchId: '3', start: '2026-10-17T18:00:00Z', state: 'unstarted', stage: 'Play-Ins', bestOf: 5,
      teams: [{ code: 'MVK', name: 'MVK Esports' }, { code: 'FUR', name: 'FURIA' }], teamsSpoiler: true, result: null },
    { matchId: '4', start: '2026-10-23T17:00:00Z', state: 'unstarted', stage: 'Swiss', bestOf: 1,
      teams: [{ code: 'TBD', name: 'TBD' }, { code: 'TBD', name: 'TBD' }], result: null },
    { matchId: 'bad', start: 'soon', state: 'unstarted', teams: [] },
  ],
};
const sched = adaptSchedule(raw);
const NOW = Date.parse('2026-10-17T04:04:00Z');
const c = (over: Partial<ScheduleCtx> = {}): ScheduleCtx => ({ schedule: sched, now: NOW, spoiler: 'scores', S: STRINGS['zh-Hant'], lang: 'zh-Hant', timeZone: 'Asia/Taipei', ...over });

describe('schedule', () => {
  it('reads the matches in time order and drops a broken one', () => {
    expect(sched.matches.map((m) => m.matchId)).toEqual(['1', '2', '3', '4']);
    expect(sched.matches[2]).toMatchObject({ state: 'unstarted', stage: 'Play-Ins', bestOf: 5, result: null });
    expect(sched.matches[1]!.result).toEqual({ wins: [3, 1], winner: 'FUR' });
    // No team logos are kept (CLAUDE.md rule 7).
    expect(JSON.stringify(sched)).not.toContain('logo.png');
  });

  it('lives next to state.json, wherever the service is', () => {
    expect(scheduleUrl('http://127.0.0.1:8787/state.json')).toBe('http://127.0.0.1:8787/schedule.json');
    expect(scheduleUrl('https://lol.example.com/live/state.json')).toBe('https://lol.example.com/live/schedule.json');
  });

  it('next match: the one on now, else the next to start', () => {
    expect(nextMatch(sched, NOW)!.matchId).toBe('3');
    const on = adaptSchedule({ matches: [...raw.matches.slice(0, 2), { ...raw.matches[2], state: 'inProgress' }] });
    expect(nextMatch(on, NOW)!.matchId).toBe('3');
    expect(nextMatch(adaptSchedule({ matches: raw.matches.slice(0, 2) }), NOW)).toBeNull();
    expect(listWindow(sched).map((m) => m.matchId)).toEqual(['1', '2', '3', '4']);
  });

  it('shows times in local time, with the weekday', () => {
    expect(fmtStart(Date.parse('2026-10-17T18:00:00Z'), 'zh-Hant', 'Asia/Taipei')).toBe('10/18（日）02:00');
    expect(fmtStart(Date.parse('2026-10-17T18:00:00Z'), 'en', 'Asia/Taipei')).toBe('Sun 10/18 02:00');
    expect(STRINGS['zh-Hant'].until(21 * 3600_000 + 56 * 60_000)).toBe('還有 21 小時 56 分');
    expect(STRINGS['zh-Hant'].until(6 * 86400_000 + 3600_000)).toBe('還有 6 天 1 小時');
    expect(STRINGS.en.until(30 * 60_000)).toBe('in 30m');
  });

  it('next-match card: teams, stage, local start and countdown', () => {
    const html = nextMatchCard(c());
    expect(html).toContain('<b>MVK</b>');
    expect(html).toContain('<b>FUR</b>');
    expect(html).toContain('入圍賽 · BO5');
    expect(html).toContain('10/18（日）02:00');
    expect(html).toContain('還有 13 小時 56 分');
    expect(html).toContain('MVK Esports · FURIA');
    expect(nextMatchLine(c())).toContain('還有 13 小時 56 分');
    expect(nextMatchCard(c({ schedule: null }))).toContain(STRINGS['zh-Hant'].ui.noSchedule);
  });

  it('spoiler level: hide scores by default; the old true/false setting carries over', () => {
    expect(DEFAULTS.spoiler).toBe('scores');
    expect(normalize({ spoiler: 'matchups' }).spoiler).toBe('matchups');
    expect(normalize({ spoiler: 'loud' }).spoiler).toBe('scores');
    expect(normalize({ spoilerFree: false }).spoiler).toBe('off');
    expect(normalize({ spoilerFree: true }).spoiler).toBe('scores');
    expect(normalize({ spoilerFree: 'no' }).spoiler).toBe('scores');
    expect(sched.matches.map((m) => m.teamsSpoiler)).toEqual([false, true, true, null]);
  });

  it('hide scores (default): no score and no winner anywhere, teams still shown', () => {
    const html = scheduleView(c());
    expect(html).not.toMatch(/3–[12]/);
    expect(html).not.toContain('class="win"');
    expect(html.match(/已結束/g)).toHaveLength(2);
    expect(html).toContain('不爆雷');
    expect(html).toContain('>MVK<');
  });

  it('hide matchups too: flagged pairings show no teams, here or on the next-match card', () => {
    const m = c({ spoiler: 'matchups' });
    const html = scheduleView(m);
    expect(html.match(/隊伍隱藏/g)).toHaveLength(2); // FUR vs C9 and MVK vs FUR; KC vs C9 is not flagged
    expect(html).not.toContain('>FUR<');
    expect(html).toContain('>KC<');
    expect(html).not.toMatch(/3–[12]/);
    const card = nextMatchCard(m);
    expect(card).toContain('隊伍隱藏');
    expect(card).not.toContain('MVK');
    expect(card).not.toContain('FURIA');
    expect(card).toContain('10/18（日）02:00');
    expect(nextMatchLine(m)).not.toContain('MVK');
  });

  it('with spoilers: scores, and the winner in bold', () => {
    const html = scheduleView(c({ spoiler: 'off' }));
    expect(html).toContain('3–2');
    expect(html).toContain('3–1');
    expect(html).toContain('<span class="win">KC</span>');
    expect(html).toContain('<span class="win">FUR</span>');
    expect(html).toContain('data-set="spoiler:off" aria-pressed="true"');
  });

  it('marks the next match and writes TBD as 待定', () => {
    const html = scheduleView(c());
    expect(html.match(/class="srow2 next"/g)).toHaveLength(1);
    expect(html).toContain('待定');
    expect(html).toContain('瑞士輪 BO1');
  });

  it('the widget shows the next match when no game is on, once the service answered', () => {
    const v = (over: Partial<ViewCtx>): ViewCtx => ({
      s: adapt({ status: 'idle' }), clock: null, show: { ...DEFAULTS.show }, gold: 'diff', S: STRINGS['zh-Hant'], lang: 'zh-Hant',
      conn: 'ok', sample: false, schedule: sched, now: NOW, spoiler: 'scores', timeZone: 'Asia/Taipei', ...over,
    });
    expect(mapView(v({}), true)).toContain('class="next-match"');
    expect(dotView(v({}))).toContain('還有 13 小時 56 分');
    expect(mapView(v({ show: { ...DEFAULTS.show, nextMatch: false } }), true)).toContain(STRINGS['zh-Hant'].status.idle);
    expect(mapView(v({ conn: 'retrying' }), true)).toContain(STRINGS['zh-Hant'].connection.retrying);
    // and the series tab steps aside
    expect(tabsView(v({}), DEFAULTS.views, true, false)).not.toContain(STRINGS['zh-Hant'].ui.noSeries);
  });
});
