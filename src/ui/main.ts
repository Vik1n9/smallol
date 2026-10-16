// The main window: a tab strip (which game of the series; the views under the game), the game in
// one of three size tiers (dot, bar, map), the draft views under it, and the settings page.
// Runs in a plain browser too (without window controls), which is how the UI is checked headless.
// Checking aids (launch args in the app, ?query in a browser), never saved:
//   --sample       show the bundled sample instead of asking the service (dev builds only)
//   --demo         with the sample: treat it as a game in progress, so countdowns run
//   --settings     open the settings page
//   --set=path:value,...  change settings in memory (e.g. language:en,views.draftGame:true)

import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { StateSource, type Connection } from '../data/streamcv/source.ts';
import { adapt, emptyState } from '../data/streamcv/adapter.ts';
import { clockNow } from '../model/clock.ts';
import type { MatchState } from '../model/types.ts';
import { detectLang, STRINGS, type Lang } from '../i18n/index.ts';
import { DEFAULTS, normalize, VIEWS, type Settings, type Size, type ViewName } from '../settings/schema.ts';
import { SettingsStore, type SettingsBackend } from '../settings/store.ts';
import { barView, dotView, draftGameView, draftSeriesView, mapView, playersView, TAB_H, tabsView, tierOf, viewHeight, type ViewCtx } from './views.ts';
import { settingsView } from './settings-view.ts';

const inTauri = '__TAURI_INTERNALS__' in window;
const win = inTauri ? getCurrentWindow() : null;
const app = document.getElementById('app')!;
const tabsEl = document.getElementById('tabs')!;
const belowEl = document.getElementById('below')!;

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
  for (const el of [app, tabsEl, belowEl]) {
    el.classList.remove('bg-solid', 'bg-semi', 'bg-clear');
    el.classList.add(`bg-${cfg().background}`);
  }
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

type Page = 'game' | 'settings';
let page: Page = 'game';
/** The game's size without the views under it; those add their own height. */
const SIZE_DEFAULT: Record<Page, Size> = { game: { w: 480, h: 236 }, settings: { w: 440, h: 500 } };
const GAP = 4;
/** Height the open views under the game add to the window. */
const viewsHeight = (s: Settings = cfg()) => VIEWS.reduce((h, v) => h + (s.views[v] ? viewHeight(v, s.show) + GAP : 0), 0);

/** True while the app itself resizes, so that size is not saved as the user's. */
let resizingTo = false;
async function resizeTo(w: number, h: number): Promise<void> {
  if (!win) return;
  resizingTo = true;
  await win.setSize(new LogicalSize(w, h)).catch(() => { /* not allowed */ });
  setTimeout(() => { resizingTo = false; }, 300);
}

async function sizeFor(p: Page): Promise<void> {
  const s = cfg().sizes[`size-${p}`] ?? SIZE_DEFAULT[p];
  await resizeTo(s.w, s.h + (p === 'game' ? viewsHeight() : 0));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  render();
  if (!win || resizingTo) return;
  if (saveTimer) clearTimeout(saveTimer);
  const p = page;
  saveTimer = setTimeout(() => {
    const h = window.innerHeight - (p === 'game' ? viewsHeight() : 0);
    settings.update((d) => { d.sizes[`size-${p}`] = { w: window.innerWidth, h: Math.max(28, h) }; });
  }, 600);
});

async function switchPage(p: Page): Promise<void> {
  page = p;
  await sizeFor(p);
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
  const game = await import('../../fixtures/streamcv/state_finished_game.json');
  // Players are not in the service yet: scripts/feed-players.mjs can put real feed numbers in raw/
  // (git-ignored) to lay that view out. Missing is fine.
  const extra = import.meta.glob<{ default: object }>('../../raw/players_*.json');
  const players = Object.values(extra)[0];
  const more = players ? (await players()).default : {};
  if (haveLive && !flags.sample) return;
  let s = adapt({ ...game.default, ...more });
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

function layout(tabs: boolean, below: number): void {
  document.body.classList.toggle('has-tabs', tabs);
  document.body.style.setProperty('--tabs-h', `${tabs ? TAB_H : 0}px`);
  document.body.style.setProperty('--below-h', `${below}px`);
}

function render(): void {
  if (page === 'settings') {
    layout(false, 0);
    belowEl.innerHTML = '';
    // Keep the endpoint field (and its caret) while the user types in it.
    if (document.activeElement?.matches('[data-input]') && app.querySelector('.settings')) return;
    app.dataset.tier = 'settings';
    app.innerHTML = settingsView(cfg(), S, endpointError);
    return;
  }
  const open = cfg().views;
  const vh = viewsHeight();
  const tier = tierOf(window.innerHeight - vh);
  const c: ViewCtx = {
    s: state, clock: clockNow(state, receivedAt, Date.now(), cfg().tickClock), show: cfg().show, gold: cfg().gold, S, lang, conn, sample,
  };
  // The pill has no room for tabs or views.
  const pill = tier === 'dot';
  layout(!pill, pill ? 0 : vh);
  app.dataset.tier = tier;
  tabsEl.innerHTML = pill ? '' : tabsView(c, open, !!win, !!quitArmed);
  const body = tier === 'dot' ? dotView(c) : tier === 'bar' ? barView(c) : mapView(c, window.innerWidth >= 320);
  app.innerHTML = body;
  const views: Record<ViewName, (c: ViewCtx) => string> = { draftGame: draftGameView, draftSeries: draftSeriesView, players: playersView };
  belowEl.innerHTML = pill ? '' : VIEWS.filter((v) => open[v])
    .map((v) => `<div class="drawer ${v}" style="height:${viewHeight(v, cfg().show)}px">${views[v](c)}</div>`).join('');
}

// Countdowns move every second; the data itself changes every 5 s.
setInterval(() => { if (page === 'game') render(); }, 1000);

// ---------- input ----------

function onClick(e: MouseEvent): void {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button, input[type=checkbox]');
  if (!t) return;
  const action = t.dataset.action;
  if (t.dataset.set) {
    const [path, value] = t.dataset.set.split(':') as [string, string];
    setPath(path, value);
  } else if (t.dataset.toggle) {
    setPath(t.dataset.toggle, (t as HTMLInputElement).checked);
  } else if (t.dataset.view) {
    const v = t.dataset.view as ViewName;
    settings.update((d) => { d.views[v] = !d.views[v]; });
  } else if (action === 'settings') void switchPage('settings');
  else if (action === 'done') { (document.activeElement as HTMLElement | null)?.blur(); void switchPage('game'); }
  else if (action === 'quit') {
    if (quitArmed) { void win?.close(); return; }
    quitArmed = setTimeout(() => { quitArmed = null; render(); }, 3000);
    render();
  }
}
for (const el of [app, tabsEl]) el.addEventListener('click', onClick);

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
  for (const el of [app, tabsEl, belowEl]) {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label, .body')) return;
      void win.startDragging();
    });
  }
  document.getElementById('grip')!.addEventListener('mousedown', (e) => {
    e.preventDefault();
    void win.startResizeDragging('SouthEast');
  });
  void listen<string>('bg-mode', (e) => {
    const m = e.payload;
    if (m === 'solid' || m === 'semi' || m === 'clear') settings.update((d) => { d.background = m; });
  });
  void listen('open-settings', () => void switchPage('settings'));
}

function onSettings(now: Settings, before: Settings): void {
  if (now.language !== before.language) applyLanguage();
  if (now.background !== before.background) applyBackground();
  if (now.endpoint !== before.endpoint && !flags.sample) { haveLive = false; source.setUrl(now.endpoint); }
  // A view opened or closed: the window grows or shrinks by its height, the game keeps its size.
  const dh = viewsHeight(now) - viewsHeight(before);
  if (dh !== 0 && page === 'game') void resizeTo(window.innerWidth, window.innerHeight + dh);
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
  for (const pair of (q.get('set') ?? '').split(',').filter(Boolean)) {
    const i = pair.indexOf(':');
    const path = pair.slice(0, i), raw = pair.slice(i + 1);
    if (i > 0) setPath(path, raw === 'true' ? true : raw === 'false' ? false : raw);
  }
  settings.subscribe(onSettings);
  applyLanguage();
  applyBackground();
  if (flags.sample) void loadSample();
  else { source.setUrl(cfg().endpoint); source.start(); }
  await switchPage(q.has('settings') ? 'settings' : 'game');
}
void start();
