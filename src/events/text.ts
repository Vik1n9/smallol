// The words for each event (docs/UI_SPEC_v1.md §4): the doer first, the team code before anything
// else, verbs by weight (推倒 → 攻破 → 摧毀 → 拿下). Pure: event and team codes in, text out.

import { championName } from '../data/champions.ts';
import { itemName } from '../data/items.ts';
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
    case 'gameEnd': {
      const sub = e.duration ? (zh ? `用時 ${clock(e.duration)}` : clock(e.duration)) : undefined;
      if (!e.team) return { title: zh ? `第 ${e.n ?? '?'} 局結束` : `Game ${e.n ?? '?'} over`, sub };
      return { title: zh ? `${T} 贏下第 ${e.n ?? '?'} 局` : `${T} take Game ${e.n ?? '?'}`, sub };
    }
    case 'seriesEnd': {
      const sc = e.score && !spoilerFree ? ` ${e.score[0]}–${e.score[1]}` : '';
      return { title: zh ? `${T} 贏下系列賽${sc}` : `${T} win the series${sc}` };
    }
    case 'tower': return { title: zh ? `${T} 推倒 ${towerName(e, code, lang)}` : `${T} topple ${towerName(e, code, lang)}` };
    case 'inhibTower': return { title: zh ? `${T} 攻破 ${towerName(e, code, lang)}` : `${T} break ${towerName(e, code, lang)}` };
    case 'nexusTower': return { title: zh ? `${T} 推倒 ${towerName(e, code, lang)}` : `${T} topple ${towerName(e, code, lang)}` };
    case 'inhibitor': {
      const sub = e.respawnIn !== undefined && e.respawnIn > 0 ? (zh ? `重生 ${clock(e.respawnIn)}` : `respawns ${clock(e.respawnIn)}`) : undefined;
      return { title: zh ? `${T} 摧毀 ${V} ${lane}水晶` : `${T} destroy ${V} ${lane ? `${lane} ` : ''}inhibitor`, sub };
    }
    case 'drake': {
      const el = e.element!;
      return { title: zh ? `${T} 拿下${S.element[el]}（第 ${e.n} 條）` : `${T} take ${DRAKE_EN[el]} (${ordinal(e.n ?? 1)})` };
    }
    case 'herald': return { title: zh ? `${T} 收下預示者` : `${T} take Herald` };
    case 'grubs': return { title: zh ? `${T} 清下虛空幼蟲（共 ${e.n} 隻）` : `${T} kill Void Grub (${e.n} total)` };
    case 'soul': return { title: zh ? `${T} 集滿龍魂 · ${S.element[e.element!].replace(/龍$/, '')}` : `${T} claim ${DRAKE_EN[e.element!]} Soul`, sub: goldLine(e, code, zh) };
    case 'elder': return { title: zh ? `${T} 擊倒遠古龍` : `${T} slay Elder Dragon`, sub: buffLine(e, code, zh) };
    case 'baron': return { title: zh ? `${T} 拿下巴龍` : `${T} secure Baron`, sub: buffLine(e, code, zh) };
    case 'bpStart': return { title: zh ? `第 ${e.n ?? '?'} 局 BP 開始 · ${code('B')} 對 ${code('R')}` : `Game ${e.n ?? '?'} draft begins · ${code('B')} vs ${code('R')}` };
    case 'inhibRespawn': return { title: zh ? `${V} ${lane}水晶重生` : `${V} ${lane ? `${lane} ` : ''}inhibitor respawns` };
    case 'nexusRespawn': return { title: zh ? `${V} 主堡塔重生` : `${V} Nexus turret respawns` };
    case 'soulPoint': {
      const next = e.element ? (zh ? ` · 下一條${S.element[e.element]}` : ` · next ${DRAKE_EN[e.element]}`) : '';
      const when = e.secondsLeft !== undefined && e.secondsLeft > 0 ? ` ${clock(e.secondsLeft)}` : '';
      return { title: zh ? `${T} 龍魂聽牌${next}${when}` : `${T} one drake from Soul${next}${when}` };
    }
    case 'dragonSoon': {
      const el = e.element ? (zh ? S.element[e.element] : DRAKE_EN[e.element]) : (zh ? '小龍' : 'Drake');
      return { title: zh ? `${el} ${e.secondsLeft} 秒後出現` : `${el} spawns in ${e.secondsLeft}s` };
    }
    case 'bossSoon': {
      const b = e.boss === 'elder' ? (zh ? '遠古龍' : 'Elder Dragon') : (zh ? '巴龍' : 'Baron');
      return { title: zh ? `${b} ${e.secondsLeft} 秒後出現` : `${b} spawns in ${e.secondsLeft}s` };
    }
    case 'baronBuffEnding': return { title: zh ? `${T} 巴龍增益剩 ${e.secondsLeft} 秒` : `${T} Baron buff ends in ${e.secondsLeft}s` };
    case 'kill':
      if (e.solo && e.player) return { title: zh ? `${T} ${e.player} 單殺 ${V} ${e.victimPlayer}` : `${T} ${e.player} solo-kills ${V} ${e.victimPlayer}` };
      return { title: zh ? `${V} ${e.victimPlayer} 倒下` : `${V} ${e.victimPlayer} down` };
    case 'goldLead5k':
    case 'goldLead10k': return { title: zh ? `${T} 經濟領先 ${e.lead}k` : `${T} up ${e.lead}k gold` };
    case 'goldFlip': return { title: zh ? `${T} 經濟反超 ${V}（+${e.lead}k）` : `${T} pass ${V} in gold (+${e.lead}k)` };
    case 'level6':
    case 'level11': return { title: zh ? `${T} ${e.player} 升 ${e.n} 級` : `${T} ${e.player} hits level ${e.n}` };
    case 'firstLegendary': {
      const it = e.item ? ` · ${itemName(e.item, lang)}` : '';
      return { title: zh ? `${T} ${e.player} 完成第一件傳說裝${it}` : `${T} ${e.player} completes first Legendary${it}` };
    }
  }
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec) % 60).padStart(2, '0')}`;
/** "經濟 FUR +5.4k"; nothing when the gold is not known (no placeholders). */
function goldLine(e: GameEvent, code: (t: Team) => string, zh: boolean): string | undefined {
  if (!e.gold) return undefined;
  return `${zh ? '經濟' : 'Gold'} ${code(e.gold.team)} +${(e.gold.amount / 1000).toFixed(1)}k`;
}
/** "增益 3:00 · 經濟 FUR +5.4k", each part only when known. */
function buffLine(e: GameEvent, code: (t: Team) => string, zh: boolean): string | undefined {
  const parts = [e.buffLeft ? `${zh ? '增益' : 'Buff'} ${clock(e.buffLeft)}` : '', goldLine(e, code, zh) ?? ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Several players reaching the same milestone close together (UI_SPEC R3, R4): "升 6 級 · MVK 中、FUR 上 +2". */
export function milestoneText(kind: 'level6' | 'firstLegendary', who: { team: string; role: string | null; player: string }[], lang: Lang): string {
  const zh = lang === 'zh-Hant';
  const S = STRINGS[lang];
  const name = (w: { team: string; role: string | null; player: string }) => `${w.team} ${w.role && w.role in S.role ? S.role[w.role as keyof typeof S.role] : w.player}`;
  const head = kind === 'level6' ? (zh ? '升 6 級' : 'Level 6') : (zh ? '第一件成裝' : 'First Legendary');
  const shown = who.slice(0, 2).map(name).join(zh ? '、' : ', ');
  const more = who.length > 2 ? ` +${who.length - 2}` : '';
  return `${head} · ${shown}${more}`;
}

/** The tower streak (UI_SPEC R1): "FUR 連推 3 塔 · MVK 中路高地塔". */
export function streakText(team: string, n: number, latest: string, lang: Lang): string {
  return lang === 'zh-Hant' ? `${team} 連推 ${n} 塔 · ${latest}` : `${team} topple ${n} turrets · ${latest}`;
}

/** Just the tower's name, for the streak's tail. */
export function towerLabel(e: GameEvent, code: (t: Team) => string, lang: Lang): string {
  return towerName(e, code, lang).trim();
}
