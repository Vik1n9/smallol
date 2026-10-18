import { describe, expect, it } from 'vitest';
import { BAR_STRINGS } from '../src/i18n/bar.ts';
import { STRINGS } from '../src/i18n/index.ts';
import { DEFAULTS, normalize, watchUrlProblem } from '../src/settings/schema.ts';
import { settingsView } from '../src/ui/settings-view.ts';

const B = BAR_STRINGS['zh-Hant'];
const S = STRINGS['zh-Hant'];

describe('stream address (batch 3 §4)', () => {
  it('only http and https, no credentials, at most 2048 characters; empty is fine (no button)', () => {
    expect(watchUrlProblem('https://www.twitch.tv/riotgames')).toBeNull();
    expect(watchUrlProblem('http://example.com/live')).toBeNull();
    expect(watchUrlProblem('')).toBeNull();
    expect(watchUrlProblem('ftp://example.com/')).toBe('scheme');
    expect(watchUrlProblem('javascript:alert(1)')).toBe('scheme');
    expect(watchUrlProblem('file:///C:/x.html')).toBe('scheme');
    expect(watchUrlProblem('https://user:pass@example.com/')).toBe('credentials');
    expect(watchUrlProblem(`https://example.com/${'a'.repeat(2048)}`)).toBe('long');
    expect(watchUrlProblem('not a url')).toBe('bad');
  });

  it('a saved file with a bad address reads back as none', () => {
    expect(normalize({ watchUrl: 'javascript:alert(1)' }).watchUrl).toBe('');
    expect(normalize({ watchUrl: 'https://youtube.com/@lolesports' }).watchUrl).toBe('https://youtube.com/@lolesports');
  });

  it('the settings tab says why an address was refused', () => {
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: 'credentials' })).toContain(B.b3.watchBad.credentials);
  });
});

describe('hotkeys and low-key in the settings tab (batch 3 §1–2)', () => {
  it('a hotkey another program holds is named; none held, no note', () => {
    const busy = settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: ['Ctrl+Alt+Shift+H'], watchError: null });
    expect(busy).toContain(B.b3.hotkeyBusy('Ctrl+Alt+Shift+H'));
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: null })).not.toContain('熱鍵被其他程式占用');
  });

  it('the low-key box shows low-key now, whichever way it came on', () => {
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: true, hotkeyBusy: [], watchError: null })).toMatch(/data-toggle="lowKey" checked/);
    expect(settingsView(DEFAULTS, S, B, false, { lowNow: false, hotkeyBusy: [], watchError: null })).not.toMatch(/data-toggle="lowKey" checked/);
  });

  it('new settings read back with defaults: hotkeys and detection on, sound off, low-key off', () => {
    const n = normalize({});
    expect([n.hotkeys, n.autoLowKey, n.cardSound, n.lowKey, n.soundVolume]).toEqual([true, true, false, false, 'mid']);
    expect(normalize({ soundVolume: 'loud' }).soundVolume).toBe('mid');
  });
});
