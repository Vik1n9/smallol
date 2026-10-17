// When no game is on: the next match with a countdown, and the schedule list under the game.
// Pure string builders. Spoiler levels: 'scores' (default) leaves out every series score and winner;
// 'matchups' also hides the teams of matches whose pairing gives a result away (teamsSpoiler).
// No team logos (CLAUDE.md rule 7).

import type { Schedule, ScheduleMatch } from '../model/schedule.ts';
import { listWindow, nextMatch } from '../data/streamcv/schedule.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import type { SpoilerLevel } from '../settings/schema.ts';
import { esc } from './views.ts';

export interface ScheduleCtx {
  schedule: Schedule | null;
  now: number;
  spoiler: SpoilerLevel;
  S: Strings;
  lang: Lang;
  /** For tests: the time zone to show times in (default: this computer's). */
  timeZone?: string;
}

/** "10/18（日）02:00" in this computer's time zone. */
export function fmtStart(ms: number, lang: Lang, timeZone?: string): string {
  const locale = lang === 'zh-Hant' ? 'zh-TW' : 'en-US';
  const parts = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    .formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = get('weekday').replace(/^週/, '');
  return lang === 'zh-Hant'
    ? `${get('month')}/${get('day')}（${wd}）${get('hour')}:${get('minute')}`
    : `${wd} ${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

const code = (c: ScheduleCtx, s: string) => (s === 'TBD' ? `<span class="muted">${esc(c.S.ui.tbd)}</span>` : `<b>${esc(s)}</b>`);
const stageOf = (c: ScheduleCtx, m: ScheduleMatch) => (m.stage ? c.S.stage[m.stage] : m.stageText);
/** The pairing itself is a spoiler and the user asked to hide those. */
export const teamsHidden = (c: ScheduleCtx, m: ScheduleMatch) => c.spoiler === 'matchups' && m.teamsSpoiler === true;
const hiddenTeams = (c: ScheduleCtx) => `<span class="muted hidden-teams" title="${esc(c.S.ui.teamsHiddenHint)}">${esc(c.S.ui.teamsHidden)}</span>`;

/** Score text for a match, or '' when spoiler-free or there is none yet. */
function score(c: ScheduleCtx, m: ScheduleMatch): string {
  if (c.spoiler !== 'off' || !m.result) return '';
  const [a, b] = m.result.wins;
  return `<span class="sc mono">${a}–${b}</span>`;
}

/** The big line when no game is on: who plays next, when, and how long until then. */
export function nextMatchCard(c: ScheduleCtx): string {
  if (!c.schedule) return `<div class="idle"><span class="muted">${esc(c.S.ui.noSchedule)}</span></div>`;
  const m = nextMatch(c.schedule, c.now);
  if (!m) return `<div class="idle"><span class="muted">${esc(c.S.ui.seasonOver)}</span></div>`;
  const [a, b] = m.teams;
  const on = m.state === 'inProgress';
  const head = `<b>${esc(on ? c.S.ui.onNow : c.S.ui.nextMatch)}</b><span class="muted">${esc(stageOf(c, m))}${m.bestOf ? ` · ${esc(c.S.bo(m.bestOf))}` : ''}</span>`;
  const hide = teamsHidden(c, m);
  const names = hide ? '' : [a, b].filter((t) => t.code !== 'TBD' && t.name !== t.code).map((t) => esc(t.name)).join(' · ');
  const when = `<span class="mono">${esc(fmtStart(m.start, c.lang, c.timeZone))}</span>${on ? '' : `<span class="until">${esc(c.S.until(m.start - c.now))}</span>`}`;
  return `<div class="next-match">
    <div class="nm-head">${head}</div>
    <div class="nm-teams">${hide ? hiddenTeams(c) : `${code(c, a.code)}${on && score(c, m) ? score(c, m) : `<span class="muted vs">vs</span>`}${code(c, b.code)}`}</div>
    ${names ? `<div class="nm-names muted">${names}</div>` : ''}
    <div class="nm-when">${when}</div>
  </div>`;
}

/** The pill and bar tiers: one line. */
export function nextMatchLine(c: ScheduleCtx): string {
  const m = c.schedule ? nextMatch(c.schedule, c.now) : null;
  if (!m) return `<span class="muted">${esc(c.schedule ? c.S.ui.seasonOver : c.S.ui.noSchedule)}</span>`;
  const [a, b] = m.teams;
  const until = m.state === 'inProgress' ? c.S.ui.onNow : c.S.until(m.start - c.now);
  const teams = teamsHidden(c, m) ? hiddenTeams(c) : `${code(c, a.code)}<span class="muted">vs</span>${code(c, b.code)}`;
  return `<span class="k">${esc(c.S.ui.nextMatch)}</span>${teams}<span class="mono muted">${esc(fmtStart(m.start, c.lang, c.timeZone))}</span><span class="until">${esc(until)}</span>`;
}

/** The view under the game: recent and upcoming matches, the next one marked. */
export function scheduleView(c: ScheduleCtx): string {
  const levels: SpoilerLevel[] = ['off', 'scores', 'matchups'];
  const toggle = `<span class="seg spoiler">${levels.map((l) => `<button data-set="spoiler:${l}" aria-pressed="${c.spoiler === l}">${esc(c.S.spoilerLevel[l])}</button>`).join('')}</span>`;
  const head = `<header><b>${esc(c.S.view.schedule)}</b>${c.spoiler !== 'off' ? `<span class="tag">${esc(c.S.ui.spoilerOn)}</span>` : ''}<span class="grow"></span>${toggle}</header>`;
  if (!c.schedule) return `${head}<p class="empty-note muted">${esc(c.S.ui.noSchedule)}</p>`;
  const next = nextMatch(c.schedule, c.now);
  const rows = listWindow(c.schedule).map((m) => {
    const [a, b] = m.teams;
    const won = (t: string) => c.spoiler === 'off' && m.result?.winner === t;
    const team = (t: string) => (t === 'TBD' ? `<span class="muted">${esc(c.S.ui.tbd)}</span>` : `<span class="${won(t) ? 'win' : ''}">${esc(t)}</span>`);
    const right = m.state === 'completed' ? (score(c, m) || `<span class="muted">${esc(c.S.ui.finished)}</span>`)
      : m.state === 'inProgress' ? `<span class="status">${esc(c.S.ui.onNow)}</span>${score(c, m)}` : '';
    return `<div class="srow2${m === next ? ' next' : ''}${m.state === 'completed' ? ' done' : ''}">
      <span class="when mono">${esc(fmtStart(m.start, c.lang, c.timeZone))}</span>
      <span class="stg muted">${esc(stageOf(c, m))}${m.bestOf ? ` ${esc(c.S.bo(m.bestOf))}` : ''}</span>
      <span class="vsx">${teamsHidden(c, m) ? hiddenTeams(c) : `${team(a.code)}<span class="muted">vs</span>${team(b.code)}`}</span>
      <span class="res">${right}</span>
    </div>`;
  }).join('');
  return `${head}<div class="slist">${rows}</div>`;
}
