// The words for each event (docs/UI_SPEC_v1.md §4): the doer first, the team code before anything
// else, verbs by weight (推倒 → 攻破 → 摧毀 → 拿下). Pure: event and team codes in, text out.

import { championName } from '../data/champions.ts';
import { STRINGS, type Lang } from '../i18n/index.ts';
import type { MatchStage } from '../model/schedule.ts';
import type { Element, Lane, Team } from '../model/types.ts';
import type { GameEvent } from './kinds.ts';

export interface EventText {
  /** The log line and the strip, or the card's first line. */
  title: string;
  /** The card's second line, when there is one. */
  sub?: string;
}

/** A champion's name short enough for a card: the part before "·" ("睿娜妲·格萊斯克" -> "睿娜妲"). */
export function shortChampion(id: string, lang: Lang): string {
  const n = championName(id, lang);
  return lang === 'zh-Hant' ? n.split('·')[0]! : n;
}

const LANE: Record<Lang, Record<Lane, string>> = { 'zh-Hant': { top: '上路', mid: '中路', bot: '下路' }, en: { top: 'Top', mid: 'Mid', bot: 'Bot' } };
const DRAKE_EN: Record<Element, string> = { infernal: 'Infernal', ocean: 'Ocean', mountain: 'Mountain', cloud: 'Cloud', hextech: 'Hextech', chemtech: 'Chemtech' };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Which tower, in words: "MVK 中路外塔" / "MVK Mid outer". */
function towerName(e: GameEvent, code: (t: Team) => string, lang: Lang): string {
  const v = e.victim ? code(e.victim) : '';
  const lane = e.lane ? LANE[lang][e.lane] : '';
  if (lang === 'zh-Hant') {
    if (e.kind === 'nexusTower') return `${v} 主堡塔`;
    if (e.kind === 'inhibTower') return `${v} ${lane}高地塔`;
    return `${v} ${lane}${e.tower === 'outer' ? '外塔' : '內塔'}`;
  }
  if (e.kind === 'nexusTower') return `${v} Nexus turret`;
  if (e.kind === 'inhibTower') return `${v} ${lane} inhib turret`;
  return `${v} ${lane} ${e.tower === 'outer' ? 'outer' : 'inner'}`;
}

export function eventText(e: GameEvent, code: (t: Team) => string, lang: Lang, spoilerFree = false): EventText {
  const S = STRINGS[lang];
  const zh = lang === 'zh-Hant';
  const T = e.team ? code(e.team) : '';
  const V = e.victim ? code(e.victim) : '';
  const lane = e.lane ? LANE[lang][e.lane] : '';
  switch (e.kind) {
    case 'reminder': {
      const [a, b] = e.teams ?? ['TBD', 'TBD'];
      const stage = e.stage ? (S.stage[e.stage as MatchStage] ?? e.stage) : '';
      const bo = e.n ? S.bo(e.n) : '';
      const sub = [stage, bo].filter(Boolean).join(zh ? ' ' : ' · ');
      if (e.minutes === 0) return { title: zh ? `即將開打 · ${a} vs ${b}` : `${a} vs ${b} starting`, sub };
      return { title: zh ? `${e.minutes} 分鐘後開打 · ${a} vs ${b}` : `${a} vs ${b} in ${e.minutes} min`, sub };
    }
    case 'ban': return { title: zh ? `${T} 禁用 ${shortChampion(e.champion!, lang)}` : `${T} ban ${shortChampion(e.champion!, lang)}` };
    case 'pick': return { title: zh ? `${T} 鎖定 ${shortChampion(e.champion!, lang)}` : `${T} lock in ${shortChampion(e.champion!, lang)}` };
    case 'bpDone': {
      const row = (t: Team) => `${code(t)} ${(e.picks?.[t] ?? []).map((id) => shortChampion(id, lang)).join(' ')}`;
      return { title: zh ? `BP 完成 · ${code('B')} 對 ${code('R')}` : `Draft complete · ${code('B')} vs ${code('R')}`, sub: `${row('B')}\n${row('R')}` };
    }
    case 'gameStart': return { title: zh ? `第 ${e.n ?? '?'} 局開打 · ${code('B')} 對 ${code('R')}` : `Game ${e.n ?? '?'} begins · ${code('B')} vs ${code('R')}` };
    case 'gameEnd':
      if (!e.team) return { title: zh ? `第 ${e.n ?? '?'} 局結束` : `Game ${e.n ?? '?'} over` };
      return { title: zh ? `${T} 贏下第 ${e.n ?? '?'} 局` : `${T} take Game ${e.n ?? '?'}` };
    case 'seriesEnd': {
      const sc = e.score && !spoilerFree ? ` ${e.score[0]}–${e.score[1]}` : '';
      return { title: zh ? `${T} 贏下系列賽${sc}` : `${T} win the series${sc}` };
    }
    case 'tower': return { title: zh ? `${T} 推倒 ${towerName(e, code, lang)}` : `${T} topple ${towerName(e, code, lang)}` };
    case 'inhibTower': return { title: zh ? `${T} 攻破 ${towerName(e, code, lang)}` : `${T} break ${towerName(e, code, lang)}` };
    case 'nexusTower': return { title: zh ? `${T} 推倒 ${towerName(e, code, lang)}` : `${T} topple ${towerName(e, code, lang)}` };
    case 'inhibitor': return { title: zh ? `${T} 摧毀 ${V} ${lane}水晶` : `${T} destroy ${V} ${lane ? `${lane} ` : ''}inhibitor` };
    case 'drake': {
      const el = e.element!;
      return { title: zh ? `${T} 拿下${S.element[el]}（第 ${e.n} 條）` : `${T} take ${DRAKE_EN[el]} (${ordinal(e.n ?? 1)})` };
    }
    case 'herald': return { title: zh ? `${T} 收下預示者` : `${T} take Herald` };
    case 'grubs': return { title: zh ? `${T} 清下虛空幼蟲（共 ${e.n} 隻）` : `${T} kill Void Grub (${e.n} total)` };
    case 'soul': return { title: zh ? `${T} 集滿龍魂 · ${S.element[e.element!].replace(/龍$/, '')}` : `${T} claim ${DRAKE_EN[e.element!]} Soul` };
    case 'elder': return { title: zh ? `${T} 擊倒遠古龍` : `${T} slay Elder Dragon` };
    case 'baron': return { title: zh ? `${T} 拿下巴龍` : `${T} secure Baron` };
  }
}

/** The tower streak (UI_SPEC R1): "FUR 連推 3 塔 · MVK 中路高地塔". */
export function streakText(team: string, n: number, latest: string, lang: Lang): string {
  return lang === 'zh-Hant' ? `${team} 連推 ${n} 塔 · ${latest}` : `${team} topple ${n} turrets · ${latest}`;
}

/** Just the tower's name, for the streak's tail. */
export function towerLabel(e: GameEvent, code: (t: Team) => string, lang: Lang): string {
  return towerName(e, code, lang).trim();
}
