// The main window: the sentinel bar (docs/UI_SPEC_v1.md). Two rows — the game's status and one log
// line — and, in the corner of the screen, cards and strips when something happens. Everything
// else (minimap, this game's draft, players, the data window) opens as its own window.
// Runs in a plain browser too (no windows or notifications there), which is how the bar is checked headless.
// Checking aids (launch args in the app, ?query in a browser), never saved:
//   --sample       show the bundled sample instead of asking the service (dev builds only)
//   --demo         with the sample: treat it as a game in progress, so countdowns run
//   --set=path:value,...  change settings in memory (e.g. language:en,mode:companion)

import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Poller, StateSource, type Connection } from '../data/streamcv/source.ts';
import { adaptSchedule, nextMatch, scheduleUrl } from '../data/streamcv/schedule.ts';
import { adaptPlayers, adaptTeams, historyUrl } from '../data/streamcv/history.ts';
import type { History } from '../model/history.ts';
import { adaptRoster, rosterUrl } from '../data/streamcv/roster.ts';
import type { RosterTeam } from '../model/roster.ts';
import type { Schedule } from '../model/schedule.ts';
import { adapt, emptyState } from '../data/streamcv/adapter.ts';
import { clockNow, fmtClock } from '../model/clock.ts';
import { TEAMS, type MatchState, type Team } from '../model/types.ts';
import { detectLang, STRINGS, type Lang } from '../i18n/index.ts';
import { BAR_STRINGS, type DataTab } from '../i18n/bar.ts';
import { DEFAULTS, normalize, PANELS, type NotifyBase, type PanelName, type Settings, type Size } from '../settings/schema.ts';
import { SettingsStore, type SettingsBackend } from '../settings/store.ts';
import { Announced, deriveEvents, dueReminders } from '../events/derive.ts';
import { Dispatcher, replacesLine, type LineUpdate } from '../events/dispatch.ts';
import { channelOf, EVENT_KINDS, type EventKind, type Level } from '../events/kinds.ts';
import { Notifier } from '../notify/notifier.ts';
import { Panels } from '../panels/manager.ts';
import { PANEL_SIZE, type PanelFrame } from '../panels/frame.ts';
import { TEAM_COLOUR } from '../render/map-svg.ts';
import { ELEMENT_COLOUR } from '../render/dragons.ts';
import { fmtStart } from './schedule-views.ts';
import { modeLabel } from './settings-view.ts';
import { esc, fmtGold } from './views.ts';

const inTauri = '__TAURI_INTERNALS__' in window;
const win = inTauri ? getCurrentWindow() : null;
const bar = document.getElementById('bar')!;
const rowA = document.getElementById('rowA')!;
const rowB = document.getElementById('rowB')!;
const icons = document.getElementById('icons')!;
const pop = document.getElementById('pop')!;

// ---------- settings ----------

const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* none */ } },
};
const backend: SettingsBackend = inTauri
  ? { read: () => invoke<string | null>('read_settings'), write: (text) => invoke('write_settings', { text }) }
  : { read: async () => local.get('settings'), write: async (text) => local.set('settings', text) };

let settings = new SettingsStore(backend, DEFAULTS);
settings.persist = false;
const cfg = () => settings.current;

let lang: Lang = 'en';
let S = STRINGS.en;
let B = BAR_STRINGS.en;
function applyLanguage(): void {
  const l = cfg().language;
  lang = l === 'auto' ? detectLang(navigator.language) : l;
  S = STRINGS[lang];
  B = BAR_STRINGS[lang];
  document.documentElement.lang = lang;
  notifier.more = B.more;
  notifier.corner = cfg().notifyCorner;
}
function applyBackground(): void {
  for (const el of [bar, pop]) { el.classList.remove('bg-solid', 'bg-semi', 'bg-clear'); el.classList.add(`bg-${cfg().background}`); }
}

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
    if (last in o) o[last] = typeof o[last] === 'number' ? Number(value) : value;
  });
}

// ---------- window size ----------

const BAR_SIZE: Record<'bar' | 'dot', Size> = { bar: { w: 340, h: 48 }, dot: { w: 220, h: 28 } };
const WIDTH_RANGE: Record<'bar' | 'dot', [number, number]> = { bar: [300, 600], dot: [180, 600] };
const tier = () => cfg().barTier;
const barWidth = () => cfg().sizes[`size-${tier()}`]?.w ?? BAR_SIZE[tier()].w;
type Pop = null | 'mode' | 'panels' | 'ask';
let popKind: Pop = null;
let popH = 0;
/** The bar's top-left while a popover opens upward, to put the window back after. */
let restoreY: number | null = null;

let resizingTo = false;
async function resizeTo(w: number, h: number): Promise<void> {
  if (!win) return;
  resizingTo = true;
  await win.setSize(new LogicalSize(w, h)).catch(() => undefined);
  setTimeout(() => { resizingTo = false; }, 300);
}
const wantedHeight = () => BAR_SIZE[tier()].h + (popKind ? popH + 4 : 0);
async function fitWindow(): Promise<void> { await resizeTo(barWidth(), wantedHeight()); }

let saveTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  render();
  if (!win || resizingTo) return;
  // Only the width is the user's: the bar's height is fixed (UI_SPEC §1).
  if (Math.abs(window.innerHeight - wantedHeight()) > 1) void resizeTo(window.innerWidth, wantedHeight());
  if (popKind) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const [lo, hi] = WIDTH_RANGE[tier()];
    const w = Math.max(lo, Math.min(hi, window.innerWidth));
    settings.update((d) => { d.sizes[`size-${tier()}`] = { w, h: BAR_SIZE[tier()].h }; });
  }, 600);
});

/** Open a popover under the bar, or above it when the bar sits low on the screen. */
async function openPop(kind: Pop): Promise<void> {
  if (popKind === kind) { await closePop(); return; }
  if (popKind) await closePop();
  popKind = kind;
  render();
  pop.hidden = false;
  popH = Math.ceil(pop.scrollHeight);
  document.body.classList.add('has-pop');
  if (win) {
    const mon = await currentMonitor();
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    const bottom = mon ? (mon.workArea.position.y + mon.workArea.size.height) / mon.scaleFactor : Infinity;
    const up = pos.y + BAR_SIZE[tier()].h + popH + 4 > bottom;
    document.body.classList.toggle('up', up);
    if (up) { restoreY = pos.y; await win.setPosition(new LogicalPosition(pos.x, pos.y - popH - 4)); }
  }
  await fitWindow();
}
async function closePop(): Promise<void> {
  if (!popKind) return;
  popKind = null;
  pop.hidden = true;
  pop.innerHTML = '';
  document.body.classList.remove('has-pop');
  await fitWindow();
  if (win && restoreY !== null) {
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    await win.setPosition(new LogicalPosition(pos.x, restoreY));
  }
  restoreY = null;
  document.body.classList.remove('up');
}

// ---------- data ----------

let state: MatchState = emptyState();
let prevState: MatchState | null = null;
let receivedAt = Date.now();
let conn: Connection = 'connecting';
let sample = false;
let haveLive = false;
const flags = { sample: false, demo: false };

const announced = new Announced();
const dispatcher = new Dispatcher();
const notifier = new Notifier();
const reminded = new Set<string>();
let pausedUntil = 0;
const paused = () => Date.now() < pausedUntil;

/** The log line on the bar, and how long it has held. */
interface Line extends LineUpdate { shownAt: number; game: string | null; quiet?: boolean }
let line: Line | null = null;
/** A 3-second note (mode changed, paused) that never enters the log. */
let note: { text: string; until: number } | null = null;

const codeOf = (s: MatchState) => (t: Team) => s.series?.teams[t].code ?? S.team[t];

function onEvents(events: ReturnType<typeof deriveEvents>, s: MatchState): void {
  if (!events.length) return;
  const now = Date.now();
  const res = dispatcher.step(events, now, cfg(), codeOf(s), lang, paused());
  if (res.line && replacesLine(line, res.line.level, now)) showLine({ ...res.line, shownAt: now, game: s.gameId });
  if (res.notices.length && inTauri) void notifier.push(res.notices);
}

let lineEl: HTMLElement | null = null;
function lineHtml(l: { text: string; at: number | null; team: Team | null }): string {
  const t = l.at === null ? '' : `<span class="t">${fmtClock(l.at)}</span>`;
  return `${t}<i class="mark" style="--c:${l.team ? TEAM_COLOUR[l.team] : 'var(--accent)'}"></i><span class="x">${esc(l.text)}</span>`;
}
/** Swap the log line: the old one leaves upward, the new one slides in (UI_SPEC §1). */
function showLine(l: Line): void {
  line = l;
  swapLine(lineHtml(l), l.level, !!l.quiet);
  // Something happened: light the bar up, then let it settle back over 10 s.
  bar.classList.add('lit');
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('lit')));
  bar.style.setProperty('--c', l.team ? TEAM_COLOUR[l.team] : 'var(--accent)');
  if (l.level === 'major') { bar.classList.remove('glow'); void bar.offsetWidth; bar.classList.add('glow'); }
}
function swapLine(html: string, level: Level | null, quiet: boolean): void {
  if (lineEl && lineEl.dataset.html === html) return;
  const old = lineEl;
  const el = document.createElement('div');
  el.className = `line in${level && level !== 'normal' ? ' flash' : ''}${quiet ? ' quiet' : ''}`;
  el.innerHTML = html;
  el.dataset.html = html;
  rowB.appendChild(el);
  lineEl = el;
  if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 120); }
}

const source = new StateSource(DEFAULTS.endpoint, {
  onState(s, at) {
    haveLive = true;
    sample = false;
    if (state.gameId !== s.gameId) dispatcher.reset();
    prevState = state.status === 'idle' && !haveSeen ? null : state;
    onEvents(deriveEvents(prevState, s, announced), s);
    haveSeen = true;
    state = s;
    receivedAt = at;
    sendPanels();
    render();
  },
  onConnection(c) { conn = c; render(); },
});
/** The first snapshot after start has no "before": no events, a baseline line instead. */
let haveSeen = false;

async function loadSample(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const game = await import('../../fixtures/streamcv/state_v05_kc_mvk_g2.json');
  let s = adapt(game.default);
  if (flags.demo && s.status === 'finished') s = { ...s, status: 'in_game' };
  state = s;
  receivedAt = Date.now();
  sample = true;
  sendPanels();
  render();
}

let schedule: Schedule | null = null;
const schedulePoller = new Poller<Schedule>(scheduleUrl(DEFAULTS.endpoint), adaptSchedule, 5 * 60_000, { onData(s) { schedule = s; sendPanels(); render(); } });
const history: History = { teams: null, players: null };
const HISTORY_MS = 3 * 60_000;
const teamsPoller = new Poller(historyUrl(DEFAULTS.endpoint, 'teams'), adaptTeams, HISTORY_MS, { onData(t) { history.teams = t; sendPanels(); } });
const playersPoller = new Poller(historyUrl(DEFAULTS.endpoint, 'players'), adaptPlayers, HISTORY_MS, { onData(p) { history.players = p; sendPanels(); } });
let roster: Record<string, RosterTeam> | null = null;
const rosterPoller = new Poller(rosterUrl(DEFAULTS.endpoint), adaptRoster, 30 * 60_000, { onData(r) { roster = r; sendPanels(); } });

// ---------- panels ----------

let dataTab: DataTab = 'schedule';
let pickedMatch: string | null = null;
let endpointError = false;
const panels = inTauri ? new Panels((n) => cfg().sizes[`size-panel-${n}`] ?? PANEL_SIZE[n]) : null;
function sendPanels(): void {
  if (!panels) return;
  const f: PanelFrame = { state, receivedAt, settings: cfg(), lang, conn, sample, schedule, history, roster, pickedMatch, dataTab, endpointError };
  panels.send(f);
}
async function openData(tab: DataTab): Promise<void> {
  dataTab = tab;
  if (!cfg().panels.data) settings.update((d) => { d.panels.data = true; });
  sendPanels();
  await panels?.focusData();
}

// ---------- drawing ----------

const dotHtml = (t: Team) => `<i class="dot" style="background:${TEAM_COLOUR[t]}"></i>`;
const ICON = {
  panels: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="5.5" height="5" rx="1"/><rect x="9" y="2.5" width="5.5" height="5" rx="1"/><rect x="1.5" y="9.5" width="13" height="4" rx="1"/></svg>',
  data: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11.5 6l3 4M14.5 6l-3 4"/></svg>',
  resume: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11.5 5.5c1 .7 1.5 1.6 1.5 2.5s-.5 1.8-1.5 2.5"/></svg>',
  tier: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5l4.5-4.5"/></svg>',
  settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/></svg>',
};

function scoreHtml(s: MatchState, compact: boolean): string {
  const code = codeOf(s);
  const k = (t: Team) => s.teams[t].kills ?? '–';
  return `<span class="score">${dotHtml('B')}${esc(code('B'))} <b>${k('B')}</b>${compact ? ':' : ' : '}<b>${k('R')}</b> ${esc(code('R'))}${dotHtml('R')}</span>`;
}
function goldText(s: MatchState): string {
  const b = s.teams.B.gold, r = s.teams.R.gold;
  if (b === null || r === null || !cfg().show.gold) return '';
  const d = b - r;
  const lead: Team | null = d > 0 ? 'B' : d < 0 ? 'R' : null;
  return `<span class="gold">${esc(S.ui.gold)} <span class="mono${lead ? ` lead-${lead}` : ''}">${d === 0 ? '±0' : `+${fmtGold(Math.abs(d))}`}</span></span>`;
}

/**
 * The objectives counting down, nearest first, at most two: the next drake (or elder), the herald, the
 * baron (the broadcast says which of herald and baron the top pit holds next). "在場" once one is up.
 */
function countdowns(s: MatchState, clock: number | null): string[] {
  if (s.status !== 'in_game' || clock === null) return [];
  const c: { at: number; html: string }[] = [];
  const chip = (label: string, at: number) => {
    const l = at - clock;
    return `<span class="cd">${label}<span class="mono">${l > 0 ? fmtClock(l) : esc(B.up)}</span></span>`;
  };
  const nd = s.nextDragon;
  if (cfg().show.nextDragon && nd) {
    const e = nd.elder ? 'elder' : nd.element;
    const tile = e ? `<span class="el" style="--c:${ELEMENT_COLOUR[e]}">${esc(S.elementShort[e])}</span>` : '<span class="el empty">?</span>';
    c.push({ at: nd.at, html: chip(tile, nd.at) });
  }
  const h = s.herald;
  if (cfg().show.herald && s.pitNext === 'herald' && h && (h.status === 'upcoming' || h.status === 'alive_or_upcoming')) c.push({ at: 15 * 60, html: chip(`<span class="k">${esc(S.ui.herald)}</span>`, 15 * 60) });
  const nb = s.nextBaron;
  if (cfg().show.nextBaron && nb && s.pitNext !== 'grubs' && s.pitNext !== 'herald') c.push({ at: nb.at, html: chip(`<span class="k">${esc(S.ui.baron)}</span>`, nb.at) });
  return c.sort((a, b) => a.at - b.at).slice(0, 2).map((x) => x.html);
}

/** Row A: what state the event is in (UI_SPEC §1, §7). */
function statusRow(clock: number | null): string {
  const s = state;
  const mute = paused() ? `<span class="mute" title="${esc(B.icon.resume)}">${ICON.pause.replace('<svg', '<svg width="12" height="12"')}</span>` : '';
  const connBad = conn === 'retrying' && !sample ? `<i class="conn" title="${esc(S.connection.retrying)}"></i>` : '';
  if (s.status === 'in_game') {
    const clk = clock === null || !cfg().show.clock ? '' : `<span class="clock">${fmtClock(clock)}</span>`;
    const cds = countdowns(s, clock).map((h, i) => h.replace('class="cd"', `class="cd cd${i}"`)).join('');
    return `${mute}${connBad}${scoreHtml(s, false)}${clk}${cds}${goldText(s)}`;
  }
  if (s.status === 'waiting') {
    const g = s.series?.game ?? s.draft?.current?.game ?? 1;
    const code = codeOf(s);
    return `${mute}${connBad}<span>${esc(B.draftOn(g))}</span><span class="score">· ${dotHtml('B')}${esc(code('B'))} ${esc(lang === 'zh-Hant' ? '對' : 'vs')} ${esc(code('R'))}${dotHtml('R')}</span>`;
  }
  if (s.status === 'finished') {
    const g = (s.series?.game ?? 0) + 1;
    return `${mute}${connBad}<span>${esc(B.between(g))}</span>`;
  }
  const m = schedule ? nextMatch(schedule, Date.now()) : null;
  if (m) return `${mute}${connBad}<span>${esc([m.stage ? S.stage[m.stage] : m.stageText, m.bestOf ? S.bo(m.bestOf) : ''].filter(Boolean).join(' '))} · ${esc(fmtStart(m.start, lang))}</span>`;
  if (schedule) return `${mute}${connBad}<span>${esc(B.seasonOver)}</span>`;
  return `${mute}${connBad}<span>${esc(conn === 'retrying' ? S.connection.retrying : S.connection.connecting)}</span>`;
}

/** Row B when nothing has happened yet in this state: a countdown, the draft so far, or a baseline. */
function restingLine(clock: number | null): { html: string; key: string } {
  const s = state;
  if (s.status === 'idle') {
    const m = schedule ? nextMatch(schedule, Date.now()) : null;
    if (!m) return { html: '', key: 'none' };
    const [a, b] = m.teams;
    const ms = m.start - Date.now();
    const until = ms <= 5 * 60_000 && ms > 0 ? `${B.startingSoon} · ${S.until(ms)}` : S.until(ms);
    const tbd = (c: string) => (c === 'TBD' ? S.ui.tbd : c);
    const text = `${tbd(a.code)} vs ${tbd(b.code)} · ${until}`;
    return { html: lineHtml({ text, at: null, team: null }), key: text };
  }
  if (s.status === 'waiting') {
    const c = s.draft?.current;
    const n = c ? TEAMS.reduce((k, t) => k + c.sides[t].bans.filter(Boolean).length + c.sides[t].picks.filter(Boolean).length, 0) : 0;
    const text = B.picksSoFar(n);
    return { html: lineHtml({ text, at: null, team: null }), key: text };
  }
  // Started mid-game: one baseline line, the game so far is not replayed.
  const code = codeOf(s);
  const k = (t: Team) => s.teams[t].kills ?? 0;
  const text = `${B.inProgress(clock === null ? '–' : fmtClock(clock))} · ${code('B')} ${k('B')}:${k('R')} ${code('R')}`;
  return { html: lineHtml({ text, at: null, team: null }), key: `base-${s.gameId}` };
}

function iconsRow(): string {
  const b = (action: string, title: string, svg: string, pressed = false) => `<button data-action="${action}" title="${esc(title)}" aria-pressed="${pressed}">${svg}</button>`;
  return `<button class="modebtn" data-action="mode" title="${esc(B.icon.mode)}">${esc(modeLabel(cfg(), B))} ▾</button>`
    + b('panels', B.icon.panels, ICON.panels, popKind === 'panels')
    + b('data', B.icon.data, ICON.data, cfg().panels.data)
    + (paused() ? b('pause', B.icon.resume, ICON.resume, true) : b('pause', B.icon.pause, ICON.pause))
    + b('tier', B.icon.tier, ICON.tier)
    + b('settings', B.icon.settings, ICON.settings);
}

function popHtml(): string {
  if (popKind === 'mode') {
    const opt = (m: 'work' | 'companion' | 'custom', hint: string) =>
      `<button class="opt" data-mode="${m}" aria-pressed="${cfg().mode === m}"><i class="r"></i><b>${esc(m === 'custom' && cfg().mode === 'custom' ? modeLabel(cfg(), B) : B.mode[m])}</b><span class="h">${esc(hint)}</span></button>`;
    return opt('work', B.modeHint.work) + opt('companion', B.modeHint.companion) + opt('custom', B.customOf(B.base[cfg().modeBase]));
  }
  if (popKind === 'panels') {
    return (['minimap', 'draftGame', 'players'] as const).map((p) => `<button class="opt" data-panel="${p}" aria-pressed="${cfg().panels[p]}"><i class="r"></i><b>${esc(B.panel[p])}</b></button>`).join('');
  }
  if (popKind === 'ask') {
    return `<div class="ask"><p>${esc(B.ask)}</p><button class="choice" data-ask="work">${esc(B.modeHint.work)}</button><button class="choice" data-ask="companion" style="margin-top:6px">${esc(B.modeHint.companion)}</button></div>`;
  }
  return '';
}

function render(): void {
  document.body.classList.toggle('dot', tier() === 'dot');
  const clock = clockNow(state, receivedAt, Date.now(), cfg().tickClock);
  if (tier() === 'dot') {
    let el = bar.querySelector<HTMLElement>('.dotrow');
    if (!el) { el = document.createElement('div'); el.className = 'dotrow'; bar.appendChild(el); }
    const s = state;
    const html = s.status === 'in_game'
      ? `${scoreHtml(s, true)}${clock === null ? '' : `<span class="clock">${fmtClock(clock)}</span>`}`
      : `<span class="muted">${restingLine(clock).html ? esc(statusRow(clock).replace(/<[^>]+>/g, '')) : ''}</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const a = statusRow(clock);
  if (rowA.dataset.html !== a) {
    rowA.innerHTML = a;
    rowA.dataset.html = a;
    // Too wide for the bar: the gold lead goes first, then the second countdown.
    for (const sel of ['.gold', '.cd1']) if (rowA.scrollWidth > rowA.clientWidth) rowA.querySelector(sel)?.remove();
  }
  const ic = iconsRow();
  if (icons.dataset.html !== ic) { icons.innerHTML = ic; icons.dataset.html = ic; }
  // Row B: a 3-second note, else the log line of this game (or the last game's, between games), else a resting line.
  const now = Date.now();
  if (note && now < note.until) swapLine(lineHtml({ text: note.text, at: null, team: null }), null, true);
  else {
    note = null;
    const current = line && (line.game === state.gameId || state.status === 'finished' || state.status === 'waiting') ? line : null;
    if (current) {
      swapLine(lineHtml(current), null, false);
      // Older lines fade to 60% over two minutes: how long ago, without a word.
      if (lineEl) lineEl.style.opacity = String(Math.max(0.6, 1 - 0.4 * Math.min(1, (now - current.shownAt) / 120_000)));
    } else {
      const r = restingLine(clock);
      swapLine(r.html, null, true);
    }
  }
  if (popKind) { const p = popHtml(); if (pop.dataset.html !== p) { pop.innerHTML = p; pop.dataset.html = p; } }
}

// The clock and countdowns move every second; reminders are checked with it.
setInterval(() => {
  render();
  const due = dueReminders(schedule, Date.now(), cfg().reminderLead, reminded);
  if (due.length) onEvents(due, state);
}, 1000);

// ---------- input ----------

function showNote(text: string): void { note = { text, until: Date.now() + 3000 }; render(); }

function setMode(m: 'work' | 'companion' | 'custom'): void {
  settings.update((d) => {
    if (m === 'custom' && d.mode !== 'custom') { d.modeBase = d.mode as NotifyBase; d.custom = {}; }
    d.mode = m;
  });
  showNote(B.feedback.mode(modeLabel(cfg(), B)));
}

/** A click on the bar, a popover, or in one of the windows (their data-* attributes). */
function act(d: Record<string, string | undefined>): void {
  if (d.mode) { setMode(d.mode as 'work' | 'companion' | 'custom'); void closePop(); return; }
  if (d.ask) { settings.update((x) => { x.mode = d.ask as 'work' | 'companion'; x.asked = true; }); void closePop(); showNote(B.feedback.mode(modeLabel(cfg(), B))); return; }
  if (d.panel && d.panel in cfg().panels && !d.action && !d.tab && !d.set && !d.toggle && !d.ev && !d.reset && !d.match && d.endpoint === undefined && !('toggleSpoiler' in d) && !d.checked) {
    const p = d.panel as PanelName;
    settings.update((x) => { x.panels[p] = !x.panels[p]; });
    return;
  }
  if (d.tab) { dataTab = d.tab as DataTab; sendPanels(); return; }
  if (d.set) { const [path, value] = d.set.split(':') as [string, string]; if (path === 'mode') setMode(value as 'work' | 'companion' | 'custom'); else setPath(path, value); return; }
  if (d.toggle) { setPath(d.toggle, d.checked === 'true'); return; }
  if (d.ev) {
    const [kind, ch] = d.ev.split(':') as [EventKind, string];
    settings.update((x) => {
      if (x.mode !== 'custom') { x.modeBase = x.mode as NotifyBase; x.custom = {}; x.mode = 'custom'; }
      x.custom[kind] = ch as Settings['custom'][string];
      // A change back to what the base says is no change.
      for (const k of EVENT_KINDS) if (x.custom[k] && x.custom[k] === channelOf(k, { ...x, custom: {} })) delete x.custom[k];
    });
    return;
  }
  if (d.reset) {
    settings.update((x) => {
      if (d.reset === 'major') { x.mode = 'custom'; x.modeBase = 'major'; } else x.mode = d.reset as 'work' | 'companion';
      x.custom = {};
    });
    showNote(B.feedback.mode(modeLabel(cfg(), B)));
    return;
  }
  if (d.match) { pickedMatch = d.match; sendPanels(); return; }
  if (d.action === 'schedule-back') { pickedMatch = null; sendPanels(); return; }
  if (d.endpoint !== undefined) {
    const v = d.endpoint;
    const ok = normalize({ ...cfg(), endpoint: v }).endpoint === v;
    endpointError = !ok;
    if (ok) settings.update((x) => { x.endpoint = v; }); else sendPanels();
    return;
  }
  if ('toggleSpoiler' in d) { settings.update((x) => { x.spoilerFree = !x.spoilerFree; }); return; }
  switch (d.action) {
    case 'mode': void openPop('mode'); break;
    case 'panels': void openPop('panels'); break;
    case 'data': if (cfg().panels.data) settings.update((x) => { x.panels.data = false; }); else void openData(dataTab); break;
    case 'pause':
      if (paused()) { pausedUntil = 0; showNote(B.feedback.resumed); } else { pausedUntil = Date.now() + 30 * 60_000; void notifier.clear(); showNote(B.feedback.paused); }
      break;
    case 'tier': settings.update((x) => { x.barTier = x.barTier === 'bar' ? 'dot' : 'bar'; }); break;
    case 'settings': void openData('settings'); break;
  }
}

// Buttons act on press: a button redrawn between press and release (the icon row redraws when a
// panel opens) lost its click, so a press did nothing (2026-10-18 check).
function onPress(e: PointerEvent): void {
  if (e.button !== 0) return;
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (t) { e.preventDefault(); act({ ...t.dataset }); }
}
for (const el of [bar, pop]) el.addEventListener('pointerdown', onPress);
// The dot: a click on it (not a drag) goes back to the bar.
bar.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('button') && tier() === 'dot' && !moved) settings.update((x) => { x.barTier = 'bar'; });
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') void closePop(); });

// Drag with a press that moves 4 px or more; a press that does not move is a click.
let down: { x: number; y: number } | null = null;
let moved = false;
bar.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
  down = { x: e.screenX, y: e.screenY };
  moved = false;
});
window.addEventListener('mousemove', (e) => {
  if (!down || !win) return;
  if (Math.hypot(e.screenX - down.x, e.screenY - down.y) >= 4) { moved = true; down = null; void win.startDragging(); }
});
window.addEventListener('mouseup', () => { down = null; });

if (win) {
  document.getElementById('grip')!.addEventListener('mousedown', (e) => { e.preventDefault(); void win.startResizeDragging('East'); });
  void listen<string>('bg-mode', (e) => {
    const m = e.payload;
    if (m === 'solid' || m === 'semi' || m === 'clear') settings.update((d) => { d.background = m; });
  });
  void listen('open-settings', () => void openData('settings'));
  void listen<Record<string, string>>('panel-action', (e) => act(e.payload));
  void listen<PanelName>('panel-closed', (e) => settings.update((d) => { d.panels[e.payload] = false; }));
  void listen<{ name: PanelName; w: number; h: number }>('panel-size', (e) => settings.update((d) => { d.sizes[`size-panel-${e.payload.name}`] = { w: e.payload.w, h: e.payload.h }; }));
}

function onSettings(now: Settings, before: Settings): void {
  if (now.language !== before.language) applyLanguage();
  if (now.background !== before.background) applyBackground();
  if (now.endpoint !== before.endpoint && !flags.sample) { haveLive = false; haveSeen = false; source.setUrl(now.endpoint); }
  if (now.endpoint !== before.endpoint) {
    schedulePoller.setUrl(scheduleUrl(now.endpoint));
    teamsPoller.setUrl(historyUrl(now.endpoint, 'teams'));
    playersPoller.setUrl(historyUrl(now.endpoint, 'players'));
    rosterPoller.setUrl(rosterUrl(now.endpoint));
  }
  if (now.barTier !== before.barTier) void fitWindow();
  notifier.corner = now.notifyCorner;
  if (PANELS.some((p) => now.panels[p] !== before.panels[p])) void panels?.sync(now.panels);
  sendPanels();
  render();
}

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search);
  if (inTauri) {
    for (const a of await invoke<string[]>('launch_args').catch(() => [] as string[])) {
      const m = /^--(set|sample)=(.+)$/.exec(a);
      if (m) q.set(m[1]!, m[2]!);
      for (const flag of ['sample', 'demo']) if (a === `--${flag}`) q.set(flag, '1');
    }
  }
  flags.sample = q.has('sample');
  flags.demo = q.has('demo');
  const checking = ['sample', 'demo', 'set'].some((k) => q.has(k));
  settings = await SettingsStore.open(backend, () => DEFAULTS);
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
  for (const [p, u] of [[schedulePoller, scheduleUrl(cfg().endpoint)], [teamsPoller, historyUrl(cfg().endpoint, 'teams')], [playersPoller, historyUrl(cfg().endpoint, 'players')], [rosterPoller, rosterUrl(cfg().endpoint)]] as const) {
    (p as Poller<unknown>).setUrl(u);
    (p as Poller<unknown>).start();
  }
  await fitWindow();
  render();
  void panels?.sync(cfg().panels);
  // The one question, the first time (UI_SPEC §8).
  if (!cfg().asked && !checking) void openPop('ask');
}
void start();
