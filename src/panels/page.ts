// The page inside an optional window (panel.html#minimap, #draftGame, #players, #data). It draws what
// the main window sends and sends clicks back; it never fetches anything itself.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';
import { STRINGS } from '../i18n/index.ts';
import { BAR_STRINGS } from '../i18n/bar.ts';
import { clockNow } from '../model/clock.ts';
import { mapSvg } from '../render/map-svg.ts';
import type { PanelName } from '../settings/schema.ts';
import { draftPanel, playersPanel } from '../ui/panel-views.ts';
import { scheduleView } from '../ui/schedule-views.ts';
import { settingsView } from '../ui/settings-view.ts';
import { draftSeriesView, esc, schedCtx, timerChips, type ViewCtx } from '../ui/views.ts';
import type { PanelFrame } from './frame.ts';

const name = (location.hash.slice(1) || 'minimap') as PanelName;
const win = getCurrentWindow();
const root = document.getElementById('panel')!;
root.classList.add(name);
let frame: PanelFrame | null = null;

function ctx(f: PanelFrame): ViewCtx {
  const S = STRINGS[f.lang];
  return {
    s: f.state, clock: clockNow(f.state, f.receivedAt, Date.now(), f.settings.tickClock), show: f.settings.show, gold: f.settings.gold, S, lang: f.lang,
    conn: f.conn, sample: f.sample, schedule: f.schedule, now: Date.now(), spoilerFree: f.settings.spoilerFree, history: f.history, pickedMatch: f.pickedMatch, roster: f.roster,
  };
}

function body(f: PanelFrame): string {
  const c = ctx(f);
  const B = BAR_STRINGS[f.lang];
  const hasGame = f.state.status === 'in_game' || f.state.status === 'finished';
  if (name === 'minimap') {
    if (!hasGame) return `<p class="none muted">${esc(c.S.status[f.state.status])}</p>`;
    const map = mapSvg(f.state, c.clock, {
      inhibitors: c.show.inhibitors, inhibTimers: c.show.inhibitors, nexusTimers: c.show.nexusTimers,
      unnamed: c.S.unnamed, unnamedTitle: esc(c.S.ui.towersUnnamed), unknownTitle: esc(c.S.ui.towersUnknown),
      drakes: c.show.dragons ? { titles: (e) => esc(c.S.element[e as keyof typeof c.S.element] ?? e) } : undefined,
    });
    // Buffs and the inhibitors the map cannot place: one small line under it.
    const chips = timerChips(c, true);
    return `${map}${chips ? `<div class="mtimers">${chips}</div>` : ''}`;
  }
  if (name === 'draftGame') return draftPanel(c);
  if (name === 'players') return playersPanel(c, window.innerWidth >= 400);
  const tabs = (['schedule', 'series', 'settings'] as const).map((t) => `<button data-tab="${t}" aria-pressed="${f.dataTab === t}">${esc(B.tab[t])}</button>`).join('');
  const content = f.dataTab === 'schedule' ? scheduleView(schedCtx(c)) : f.dataTab === 'series' ? draftSeriesView(c) : settingsView(f.settings, c.S, B, f.endpointError);
  return `<nav class="dtabs">${tabs}</nav><div class="dbody tab-${f.dataTab}">${content}</div>`;
}

let lastHtml = '';
function draw(): void {
  if (!frame) return;
  document.documentElement.lang = frame.lang;
  root.classList.remove('bg-solid', 'bg-semi', 'bg-clear');
  root.classList.add(`bg-${name === 'data' ? 'solid' : frame.settings.background}`);
  // Keep the endpoint field (and its caret) while the user types in it.
  if (document.activeElement?.matches('[data-input]')) return;
  const html = body(frame);
  if (html === lastHtml) return;
  // Redraw the data window's body without losing where it was scrolled to.
  const scroller = root.querySelector('.dbody');
  const top = scroller?.scrollTop ?? 0;
  root.innerHTML = html;
  lastHtml = html;
  const again = root.querySelector('.dbody');
  if (again) again.scrollTop = top;
}

// Timers move every second (the minimap's respawn tags); the data window's countdowns each minute.
setInterval(draw, name === 'data' ? 30_000 : 1000);
new ResizeObserver(() => { lastHtml = ''; draw(); }).observe(root);

// Clicks go to the main window, which owns the settings and the game.
root.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button, input[type=checkbox]');
  if (!t) return;
  const data: Record<string, string> = { panel: name, ...t.dataset } as Record<string, string>;
  if (t instanceof HTMLInputElement && t.type === 'checkbox') data.checked = String(t.checked);
  void emit('panel-action', data);
});
function commitEndpoint(input: HTMLInputElement): void {
  void emit('panel-action', { panel: name, endpoint: input.value.trim() });
  input.blur();
}
root.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('[data-input=endpoint]') && e.key === 'Enter') commitEndpoint(t as HTMLInputElement);
});
root.addEventListener('focusout', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('[data-input=endpoint]')) commitEndpoint(t as HTMLInputElement);
});

// Drag from anywhere that is not a control; resize from the corner; close from the corner button.
root.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label, a, .dbody')) return;
  void win.startDragging();
});
document.getElementById('grip')!.addEventListener('mousedown', (e) => { e.preventDefault(); void win.startResizeDragging('SouthEast'); });
document.getElementById('close')!.addEventListener('click', () => void emit('panel-closed', name));

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
void win.onResized(() => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    const s = (await win.innerSize()).toLogical(await win.scaleFactor());
    void emit('panel-size', { name, w: Math.round(s.width), h: Math.round(s.height) });
  }, 400);
});

const self = getCurrentWebviewWindow();
void (async () => {
  await self.listen<PanelFrame>('panel-frame', (e) => { frame = e.payload; draw(); });
  await emit('panel-ready', name);
})();
