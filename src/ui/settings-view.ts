// The settings page, drawn in the main window. Pure: settings in, HTML out. Clicks carry
// data-set="path:value" (or data-toggle="path") and main.ts applies them.

import type { Strings } from '../i18n/index.ts';
import { FEATURES, VIEWS, type Settings } from '../settings/schema.ts';
import { esc } from './views.ts';

const seg = (path: string, current: string, options: [string, string][]) =>
  `<span class="seg">${options.map(([v, label]) => `<button data-set="${path}:${v}" aria-pressed="${v === current}">${esc(label)}</button>`).join('')}</span>`;

const check = (path: string, on: boolean, label: string) =>
  `<label class="check"><input type="checkbox" data-toggle="${path}" ${on ? 'checked' : ''}/>${esc(label)}</label>`;

export function settingsView(cfg: Settings, S: Strings, endpointError: boolean): string {
  const t = S.set;
  return `<div class="settings">
    <header><b>${esc(t.title)}</b><span class="grow"></span><button class="done" data-action="done">${esc(S.ui.done)}</button></header>
    <div class="body">
      <div class="srow"><span class="k">${esc(t.language)}</span>${seg('language', cfg.language, [['auto', t.auto], ['zh-Hant', '中文'], ['en', 'English']])}</div>
      <div class="srow"><span class="k">${esc(t.background)}</span>${seg('background', cfg.background, [['solid', t.solid], ['semi', t.semi], ['clear', t.clear]])}</div>
      <h3>${esc(t.show)}</h3>
      <div class="chips">${FEATURES.map((f) => check(`show.${f}`, cfg.show[f], S.feature[f])).join('')}</div>
      <h3>${esc(t.views)}</h3>
      <div class="chips">${VIEWS.map((v) => check(`views.${v}`, cfg.views[v], S.view[v])).join('')}</div>
      <div class="srow"><span class="k">${esc(t.goldView)}</span>${seg('gold', cfg.gold, [['diff', t.goldDiff], ['totals', t.goldTotals]])}</div>
      <div class="srow">${check('tickClock', cfg.tickClock, t.tickClock)}</div>
      <h3>${esc(t.endpoint)}</h3>
      <div class="srow"><input class="key" data-input="endpoint" value="${esc(cfg.endpoint)}" spellcheck="false"/></div>
      <p class="note">${esc(endpointError ? t.endpointBad : t.endpointNote)}</p>
      <h3>${esc(t.about)}</h3>
      <p class="about">${esc(t.aboutText)}</p>
    </div>
  </div>`;
}
