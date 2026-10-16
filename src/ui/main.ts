// The main window: the game in one of three size tiers (dot, bar, map), and the settings page.
// Runs in a plain browser too (without window controls), which is how the UI is checked headless.
// Checking aids (launch args in the app, ?query in a browser), never saved:
//   --sample       show the bundled sample instead of asking the service (dev builds only)
//   --demo         with the sample: treat it as a game in progress, so countdowns run
//   --settings     open the settings page
//   --set=path:value,...  change settings in memory (e.g. language:en,show.gold:false)

import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { StateSource, type Connection } from '../data/streamcv/source.ts';
import { adapt, emptyState } from '../data/streamcv/adapter.ts';
import { clockNow } from '../model/clock.ts';
import type { MatchState } from '../model/types.ts';
import { detectLang, STRINGS, type Lang } from '../i18n/index.ts';
import { DEFAULTS, normalize, type Settings, type Size } from '../settings/schema.ts';
import { SettingsStore, type SettingsBackend } from '../settings/store.ts';
import { barView, dotView, mapView, tierOf, type ViewCtx } from './views.ts';
import { settingsView } from './settings-view.ts';

const inTauri = '__TAURI_INTERNALS__' in window;
const win = inTauri ? getCurrentWindow() : null;
const app = document.getElementById('app')!;

// ---------- settings ----------

const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* none */ } },
};
/** settings.json in the app config dir; in a plain browser, localStorage stands in. */
const backend: SettingsBackend = inTauri
  ? { read: () => invoke<string | null>('read_settings'), write: (text) => invoke('write_settings', { text }) }
  : { read: async () => local.get('settings'), write: async (text) => local.set('settings', text) };

let settings = new SettingsStore(backend, DEFAULTS);
settings.persist = false;
const cfg = () => settings.current;

let lang: Lang = 'en';
let S = STRINGS.en;
function applyLanguage(): void {
  const l = cfg().language;
  lang = l === 'auto' ? detectLang(navigator.language) : l;
  S = STRINGS[lang];
  document.documentElement.lang = lang;
}

function applyBackground(): void {
  app.classList.remove('bg-solid', 'bg-semi', 'bg-clear');
  app.classList.add(`bg-${cfg().background}`);
}

/** Set one setting by its dotted path ("show.gold", "language"), as a click or --set does. */
function setPath(path: string, value: unknown): void {
  settings.update((d) => {
    const keys = path.split('.');
    let o = d as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) {
      const next = o[k];
      if (!next || typeof next !== 'object') return;
      o = next as Record<string, unknown>;
    }
    const last = keys[keys.length - 1]!;
    if (last in o) o[last] = value;
  });
}

// ---------- window size per view ----------

type View = 'game' | 'settings';
let view: View = 'game';
const SIZE_DEFAULT: Record<View, Size> = { game: { w: 420, h: 214 }, settings: { w: 420, h: 470 } };

async function sizeFor(v: View): Promise<void> {
  if (!win) return;
  const s = cfg().sizes[`size-${v}`] ?? SIZE_DEFAULT[v];
  await win.setSize(new LogicalSize(s.w, s.h)).catch(() => { /* not allowed */ });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  render();
  if (!win || resizingTo) return;
  if (saveTimer) clearTimeout(saveTimer);
  const v = view;
  saveTimer = setTimeout(() => {
    settings.update((d) => { d.sizes[`size-${v}`] = { w: window.innerWidth, h: window.innerHeight }; });
  }, 600);
});
/** True while the app itself resizes for a view change, so that size is not saved as the user's. */
let resizingTo = false;
async function switchView(v: View): Promise<void> {
  view = v;
  resizingTo = true;
  await sizeFor(v);
  setTimeout(() => { resizingTo = false; }, 300);
  render();
}

// ---------- data ----------

let state: MatchState = emptyState();
let receivedAt = Date.now();
let conn: Connection = 'connecting';
let sample = false;
let haveLive = false;
const flags = { sample: false, demo: false };

async function loadSample(): Promise<void> {
  // Dev builds only: the sample is not bundled into a release.
  if (!import.meta.env.DEV) return;
  const mod = await import('../../fixtures/streamcv/state_finished_game.json');
  if (haveLive && !flags.sample) return;
  let s = adapt(mod.default);
  if (flags.demo) s = { ...s, status: 'in_game' };
  state = s;
  receivedAt = Date.now();
  sample = true;
  render();
}

const source = new StateSource(DEFAULTS.endpoint, {
  onState(s, at) {
    haveLive = true;
    sample = false;
    state = s;
    receivedAt = at;
    render();
  },
  onConnection(c) {
    conn = c;
    if (c === 'retrying' && !haveLive && !sample) void loadSample();
    render();
  },
});

// ---------- drawing ----------

let endpointError = false;
let quitArmed: ReturnType<typeof setTimeout> | null = null;

function controls(): string {
  const quit = win ? `<button class="quit${quitArmed ? ' armed' : ''}" data-action="quit" title="${S.ui.quit}">${quitArmed ? S.ui.quitAgain : '✕'}</button>` : '';
  return `<div class="controls"><button data-action="settings" title="${S.ui.settings}">⚙</button>${quit}</div>`;
}

function render(): void {
  if (view === 'settings') {
    // Keep the endpoint field (and its caret) while the user types in it.
    if (document.activeElement?.matches('[data-input]') && app.querySelector('.settings')) return;
    app.dataset.tier = 'settings';
    app.innerHTML = settingsView(cfg(), S, endpointError);
    return;
  }
  const tier = tierOf(window.innerHeight);
  const c: ViewCtx = {
    s: state, clock: clockNow(state, receivedAt, Date.now(), cfg().tickClock), show: cfg().show, gold: cfg().gold, S, conn, sample,
  };
  app.dataset.tier = tier;
  const body = tier === 'dot' ? dotView(c) : tier === 'bar' ? barView(c) : mapView(c, window.innerWidth >= 300);
  app.innerHTML = body + controls();
}

// Countdowns move every second; the data itself changes every 5 s.
setInterval(() => { if (view === 'game') render(); }, 1000);

// ---------- input ----------

app.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button, input[type=checkbox]');
  if (!t) return;
  const action = t.dataset.action;
  if (t.dataset.set) {
    const [path, value] = t.dataset.set.split(':') as [string, string];
    setPath(path, value);
  } else if (t.dataset.toggle) {
    setPath(t.dataset.toggle, (t as HTMLInputElement).checked);
  } else if (action === 'settings') void switchView('settings');
  else if (action === 'done') { (document.activeElement as HTMLElement | null)?.blur(); void switchView('game'); }
  else if (action === 'quit') {
    if (quitArmed) { void win?.close(); return; }
    quitArmed = setTimeout(() => { quitArmed = null; render(); }, 3000);
    render();
  }
});

function commitEndpoint(input: HTMLInputElement): void {
  const v = input.value.trim();
  const ok = normalize({ ...cfg(), endpoint: v }).endpoint === v;
  endpointError = !ok;
  if (ok) settings.update((d) => { d.endpoint = v; });
  input.blur();
  render();
}
app.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('[data-input=endpoint]') && e.key === 'Enter') commitEndpoint(t as HTMLInputElement);
});
app.addEventListener('focusout', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('[data-input=endpoint]')) commitEndpoint(t as HTMLInputElement);
});

if (win) {
  app.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label, .body')) return;
    void win.startDragging();
  });
  document.getElementById('grip')!.addEventListener('mousedown', (e) => {
    e.preventDefault();
    void win.startResizeDragging('SouthEast');
  });
  void listen<string>('bg-mode', (e) => {
    const m = e.payload;
    if (m === 'solid' || m === 'semi' || m === 'clear') settings.update((d) => { d.background = m; });
  });
  void listen('open-settings', () => void switchView('settings'));
}

function onSettings(now: Settings, before: Settings): void {
  if (now.language !== before.language) applyLanguage();
  if (now.background !== before.background) applyBackground();
  if (now.endpoint !== before.endpoint && !flags.sample) { haveLive = false; source.setUrl(now.endpoint); }
  render();
}

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search);
  if (inTauri) {
    for (const a of await invoke<string[]>('launch_args').catch(() => [] as string[])) {
      const m = /^--(set)=(.+)$/.exec(a);
      if (m) q.set(m[1]!, m[2]!);
      for (const flag of ['sample', 'demo', 'settings']) if (a === `--${flag}`) q.set(flag, '1');
    }
  }
  flags.sample = q.has('sample');
  flags.demo = q.has('demo');
  const checking = ['sample', 'demo', 'settings', 'set'].some((k) => q.has(k));
  settings = await SettingsStore.open(backend, () => DEFAULTS);
  // A checking run changes nothing on disk.
  settings.persist = !checking;
  settings.subscribe(onSettings);
  for (const pair of (q.get('set') ?? '').split(',').filter(Boolean)) {
    const i = pair.indexOf(':');
    const path = pair.slice(0, i), raw = pair.slice(i + 1);
    if (i > 0) setPath(path, raw === 'true' ? true : raw === 'false' ? false : raw);
  }
  applyLanguage();
  applyBackground();
  if (flags.sample) void loadSample();
  else { source.setUrl(cfg().endpoint); source.start(); }
  await switchView(q.has('settings') ? 'settings' : 'game');
}
void start();
