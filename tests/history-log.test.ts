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

  it('reads a saved file back and drops broken entries', () => {
    const good = e('g', 'ok');
    expect(parseEntries(JSON.stringify([good, { text: 1 }, null]))).toEqual([good]);
    expect(parseEntries('not json')).toEqual([]);
  });
});
