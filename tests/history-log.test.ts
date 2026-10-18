import { describe, expect, it } from 'vitest';
import { addEntries, historyView, parseEntries, type LogEntry } from '../src/events/history-log.ts';
import { BAR_STRINGS } from '../src/i18n/bar.ts';

const B = BAR_STRINGS['zh-Hant'];
const e = (game: string, text: string, level: LogEntry['level'] = 'normal', code: string | null = 'KC', at: number | null = 600, t = 0): LogEntry =>
  ({ game, n: 2, teams: ['KC', 'MVK'], at, text, level, side: code === 'KC' ? 'B' : code === 'MVK' ? 'R' : null, code, victim: null, t });

describe('log history', () => {
  it('keeps the last five games', () => {
    let list: LogEntry[] = [];
    for (let g = 1; g <= 7; g++) list = addEntries(list, [e(`g${g}`, `x${g}`)]);
    expect([...new Set(list.map((x) => x.game))]).toEqual(['g3', 'g4', 'g5', 'g6', 'g7']);
  });

  it('keeps the same event once (a replayed game, or a restart mid-game)', () => {
    const nexus = e('g', 'FUR 推倒 MVK 主堡塔', 'normal', 'KC', 2185);
    expect(addEntries(addEntries([nexus], [{ ...nexus, t: 9 }]), [{ ...nexus, t: 10 }])).toHaveLength(1);
    expect(addEntries([e('g', 'BP', 'normal', null, null)], [e('g', 'BP', 'normal', null, null)])).toHaveLength(2);
  });

  it('filters by importance or team; newest next to the bar either way', () => {
    const list = [e('g', 'KC 推倒 MVK 中路外塔', 'normal', 'KC', 700), e('g', 'MVK 拿下巴龍', 'major', 'MVK', 1500)];
    const down = historyView(list, 'all', B, true);
    expect(down.indexOf('MVK 拿下巴龍')).toBeLessThan(down.indexOf('KC 推倒'));
    expect(down.indexOf('class="hlist')).toBeLessThan(down.indexOf('class="hfilter"'));
    const up = historyView(list, 'all', B, false);
    expect(up.indexOf('KC 推倒')).toBeLessThan(up.indexOf('MVK 拿下巴龍'));
    expect(up.indexOf('class="hfilter"')).toBeLessThan(up.indexOf('class="hlist'));
    expect(historyView(list, 'big', B, true)).not.toContain('KC 推倒');
    expect(historyView(list, 'MVK', B, true)).not.toContain('KC 推倒');
    expect(down).toContain('第 2 局 · KC 對 MVK');
    expect(down).toContain('data-team="MVK"');
    expect(down).toContain('class="hrow major"');
  });

  it('orders a game by game time, not by when each event was logged (review H1)', () => {
    const list = [e('g', 'KC 推倒 MVK 中路外塔', 'normal', 'KC', 1340, 2), e('g', 'MVK 拿下巴龍', 'major', 'MVK', 1320, 1), e('g', 'KC 拿下火龍（第 1 條）', 'important', 'KC', 1350, 3)];
    const up = historyView(list, 'all', B, false);
    expect(up.indexOf('拿下巴龍')).toBeLessThan(up.indexOf('推倒 MVK 中路外塔'));
    expect(up.indexOf('推倒 MVK 中路外塔')).toBeLessThan(up.indexOf('拿下火龍'));
  });

  it('rows without a game time (draft, start) come before the clock, even when logged late', () => {
    const list = [e('g', 'MVK 單殺', 'normal', 'MVK', 2156, 1), e('g', '第 3 局開打', 'major', null, null, 5), e('g', 'FUR 摧毀 MVK 下路水晶', 'important', 'FUR', 2165, 2)];
    const up = historyView(list, 'all', B, false);
    // The subject column takes the leading code, so the rows read "單殺" and "摧毀 …".
    expect(up.indexOf('第 3 局開打')).toBeLessThan(up.indexOf('>單殺'));
    expect(up.indexOf('>單殺')).toBeLessThan(up.indexOf('摧毀'));
  });

  it('the subject column holds the code once; a death names the team that died; the bar line is not repeated (review H2)', () => {
    const death: LogEntry = { ...e('g', 'MVK Kratos 倒下', 'normal', null), victim: 'MVK', victimPlayer: 'Kratos' };
    const tower = e('g', 'KC 推倒 MVK 中路外塔', 'normal', 'KC', 700);
    const html = historyView([tower, death], 'all', B, true, (code, name) => (code === 'MVK' && name === 'Kratos' ? 'Kratos' : null));
    expect(html).toContain('data-team="KC">KC</button></span><span class="x" title="KC 推倒 MVK 中路外塔">推倒 MVK 中路外塔');
    expect(html).toContain('data-team="MVK">MVK</button>');
    expect(html).toContain('data-player="MVK|Kratos">Kratos</button> 倒下');
    // A name the roster does not know is not a link (no dead links).
    expect(historyView([death], 'all', B, true)).not.toContain('data-player');
    // The newest row equals the bar's line: left out.
    expect(historyView([tower, death], 'all', B, true, undefined, 'MVK Kratos 倒下')).not.toContain('Kratos 倒下');
  });

  it('reads a saved file back and drops broken entries', () => {
    const good = e('g', 'ok');
    expect(parseEntries(JSON.stringify([good, { text: 1 }, null]))).toEqual([good]);
    expect(parseEntries('not json')).toEqual([]);
    const nexus = e('g', 'FUR 推倒 MVK 主堡塔', 'normal', 'FUR', 2185);
    expect(parseEntries(JSON.stringify([nexus, { ...nexus, t: 5 }, { ...nexus, t: 9 }]))).toHaveLength(1);
  });
});
