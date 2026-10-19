// Draws one of the app's windows in a plain browser, for the site's pictures: the same render code the
// app uses, fed the bundled sample game (fixtures/), so no clicks, no live service and no Tauri.
//   /site/shots/harness.html?view=minimap|players|draft|notices&lang=zh-Hant|en
// The notices are built the way the dispatcher builds them: eventText for the words, the game clock for the time.

import game from '../../fixtures/streamcv/state_v05_kc_mvk_g2.json';
import { adapt } from '../../src/data/streamcv/adapter.ts';
import { STRINGS, type Lang } from '../../src/i18n/index.ts';
import { BAR_STRINGS } from '../../src/i18n/bar.ts';
import { fmtClock } from '../../src/model/clock.ts';
import type { Team } from '../../src/model/types.ts';
import { mapSvg } from '../../src/render/map-svg.ts';
import { DEFAULTS } from '../../src/settings/schema.ts';
import { draftPanel, playersPanel } from '../../src/ui/panel-views.ts';
import { esc, timerChips, type ViewCtx } from '../../src/ui/views.ts';
import { eventText } from '../../src/events/text.ts';
import type { GameEvent } from '../../src/events/kinds.ts';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'minimap';
const lang = (q.get('lang') === 'en' ? 'en' : 'zh-Hant') as Lang;
const s = { ...adapt(game as never), status: 'in_game' as const };
const S = STRINGS[lang];
const c: ViewCtx = {
  s, clock: s.clock, show: DEFAULTS.show, gold: DEFAULTS.gold, S, lang, conn: 'ok', sample: false, schedule: null,
  now: Date.now(), spoilerFree: false, history: { teams: null, players: null }, pickedMatch: null, roster: null,
};
const root = document.getElementById('panel')!;
root.classList.add(view === 'draft' ? 'draftGame' : view);

if (view === 'minimap') {
  const map = mapSvg(s, c.clock, {
    inhibitors: c.show.inhibitors, inhibTimers: c.show.inhibitors, nexusTimers: c.show.nexusTimers,
    unnamed: S.unnamed, unnamedTitle: esc(S.ui.towersUnnamed), unknownTitle: esc(S.ui.towersUnknown),
    drakes: c.show.dragons ? { titles: (e) => esc(S.element[e as keyof typeof S.element] ?? e) } : undefined,
    pits: {
      dragon: c.show.nextDragon, top: c.show.nextBaron || c.show.herald || c.show.voidgrubs,
      titles: (k) => esc(k in S.element ? S.element[k as keyof typeof S.element] : (BAR_STRINGS[lang].event as Record<string, string>)[k] ?? k),
    },
    noUnnamed: true,
    teams: s.series ? { B: esc(s.series.teams.B.code), R: esc(s.series.teams.R.code) } : undefined,
  });
  const chips = timerChips(c, true);
  root.innerHTML = `${map}${chips ? `<div class="mtimers">${chips}</div>` : ''}`;
} else if (view === 'players') {
  root.innerHTML = playersPanel(c, window.innerWidth >= 400);
} else if (view === 'draft') {
  root.innerHTML = draftPanel(c);
} else {
  // The notices: two cards and three strips, oldest at the top, as the corner shows them.
  root.remove();
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/src/notify/notify.css';
  document.head.appendChild(css);
  const code = (t: Team) => s.series?.teams[t].code ?? t;
  const p = (t: Team, i: number) => s.players?.[t][i]?.name ?? '?';
  const dr = s.teams.B.dragons;
  const events: [GameEvent, 'card' | 'strip'][] = [
    // Times and drakes from the sample: Baron at 32:05 (its buff has 1:55 left at 33:10), KC's latest drake.
    [{ kind: 'drake', team: 'B', at: 1780, element: dr.at(-1) ?? 'ocean', n: dr.length || 1 }, 'strip'],
    [{ kind: 'kill', team: 'R', victim: 'B', at: 1852, player: p('R', 1), victimPlayer: p('B', 1), solo: true }, 'strip'],
    [{ kind: 'tower', team: 'B', victim: 'R', at: 1890, lane: 'mid', tower: 'inner' }, 'strip'],
    [{ kind: 'baron', team: 'B', at: 1925, buffLeft: 180, gold: { team: 'B', amount: 6800 } }, 'card'],
  ];
  const stack = document.createElement('main');
  stack.id = 'stack';
  for (const [e, kind] of events) {
    const { title, sub } = eventText(e, code, lang);
    const el = document.createElement('div');
    el.className = `item ${kind} ${e.team ?? ''}`;
    const time = e.at !== null ? `<span class="time">${fmtClock(e.at)}</span>` : '';
    el.innerHTML = kind === 'card'
      ? `<div class="head"><span class="title">${esc(title)}</span>${time}</div>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`
      : `<span class="title">${esc(title)}</span>${time}`;
    el.style.animation = 'none';
    stack.appendChild(el);
  }
  document.body.appendChild(stack);
}
document.body.dataset.ready = '1';
