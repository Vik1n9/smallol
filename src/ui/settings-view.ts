// The settings tab of the data window (docs/UI_SPEC_v1.md §6). Pure: settings in, HTML out. Clicks
// carry data-set="path:value", data-toggle="path", data-ev="kind:channel" or data-reset="base";
// the main window applies them.

import type { Strings } from '../i18n/index.ts';
import type { BarStrings } from '../i18n/bar.ts';
import { channelOf, EVENT_KINDS } from '../events/kinds.ts';
import { CHANNELS, FEATURES, REMINDER_LEADS, SOON_LEADS, type Settings } from '../settings/schema.ts';
import { esc } from './views.ts';

const seg = (path: string, current: string, options: [string, string][]) =>
  `<span class="seg">${options.map(([v, label]) => `<button data-set="${path}:${v}" aria-pressed="${v === current}">${esc(label)}</button>`).join('')}</span>`;

const check = (path: string, on: boolean, label: string) =>
  `<label class="check"><input type="checkbox" data-toggle="${path}" ${on ? 'checked' : ''}/>${esc(label)}</label>`;

/** "上班" / "自訂（基於 陪看）": what the mode label says. */
export function modeLabel(cfg: Settings, B: BarStrings): string {
  return cfg.mode === 'custom' ? B.customOf(B.base[cfg.modeBase]) : B.mode[cfg.mode];
}

export function settingsView(cfg: Settings, S: Strings, B: BarStrings, endpointError: boolean): string {
  const t = S.set;
  const modes = (['work', 'companion', 'custom'] as const).map((m) =>
    `<button data-set="mode:${m}" aria-pressed="${cfg.mode === m}">${esc(m === 'custom' && cfg.mode === 'custom' ? modeLabel(cfg, B) : B.mode[m])}</button>`).join('');
  const events = EVENT_KINDS.map((k) => {
    const ch = channelOf(k, cfg);
    return `<div class="evrow"><span class="evk">${esc(B.event[k])}</span><span class="seg sm">${CHANNELS.map((c) => `<button data-ev="${k}:${c}" aria-pressed="${c === ch}">${esc(B.channel[c])}</button>`).join('')}</span></div>`;
  }).join('');
  return `<div class="settings">
    <h3>${esc(B.sections.notify)}</h3>
    <div class="srow"><span class="seg">${modes}</span></div>
    ${cfg.mode !== 'custom' ? `<p class="note">${esc(B.modeHint[cfg.mode])}</p>` : ''}
    <h3>${esc(B.sections.events)}</h3>
    <div class="srow"><span class="k">${esc(B.reset)}</span><span class="seg sm">${(['work', 'companion', 'major'] as const).map((b) => `<button data-reset="${b}">${esc(B.base[b])}</button>`).join('')}</span></div>
    <div class="events">${events}</div>
    <div class="srow"><span class="k">${esc(B.sections.reminder)}</span>${seg('reminderLead', String(cfg.reminderLead), REMINDER_LEADS.map((n) => [String(n), n === 0 ? B.atStart : B.minutes(n)]))}</div>
    <div class="srow"><span class="k">${esc(B.sections.soon)}</span>${seg('soonLead', String(cfg.soonLead), SOON_LEADS.map((n) => [String(n), B.seconds(n)]))}</div>
    <div class="srow"><span class="k">${esc(B.sections.milestones)}</span>${seg('milestones', cfg.milestones, [['all', B.milestones.all], ['mine', B.milestones.mine]])}</div>
    <div class="srow"><span class="k">${esc(B.sections.corner)}</span>${seg('notifyCorner', cfg.notifyCorner, [['br', B.corner.br], ['tr', B.corner.tr]])}</div>
    <h3>${esc(B.sections.panels)}</h3>
    <div class="chips">${(['minimap', 'draftGame', 'players'] as const).map((p) => check(`panels.${p}`, cfg.panels[p], B.panel[p])).join('')}</div>
    <h3>${esc(B.sections.general)}</h3>
    <div class="srow"><span class="k">${esc(t.language)}</span>${seg('language', cfg.language, [['auto', t.auto], ['zh-Hant', '中文'], ['en', 'English']])}</div>
    <div class="srow"><span class="k">${esc(t.background)}</span>${seg('background', cfg.background, [['solid', t.solid], ['semi', t.semi], ['clear', t.clear]])}</div>
    <div class="srow">${check('spoilerFree', cfg.spoilerFree, t.spoilerFree)}</div>
    <div class="srow">${check('tickClock', cfg.tickClock, t.tickClock)}</div>
    <h3>${esc(t.show)}</h3>
    <div class="chips">${FEATURES.filter((f) => f !== 'series' && f !== 'nextMatch').map((f) => check(`show.${f}`, cfg.show[f], S.feature[f])).join('')}</div>
    <h3>${esc(t.endpoint)}</h3>
    <div class="srow"><input class="key" data-input="endpoint" value="${esc(cfg.endpoint)}" spellcheck="false"/></div>
    <p class="note">${esc(endpointError ? t.endpointBad : t.endpointNote)}</p>
    <h3>${esc(t.about)}</h3>
    <p class="about">${esc(t.aboutText)}</p>
  </div>`;
}
