// UI strings, Traditional Chinese (Taiwan) and English. Same shape as Basesmall's: one typed
// record per language, so a key missing in either language fails the type check.

import type { Element, GameStatus, Team } from '../model/types.ts';
import type { Feature } from '../settings/schema.ts';
import type { Connection } from '../data/streamcv/source.ts';

export type Lang = 'zh-Hant' | 'en';
export const LANGS: readonly Lang[] = ['zh-Hant', 'en'];

export function detectLang(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en';
}

export interface Strings {
  team: Record<Team, string>;
  /** One letter or character for tight spots. */
  teamShort: Record<Team, string>;
  status: Record<GameStatus, string>;
  /** For the dot tier. */
  statusShort: Record<'waiting' | 'finished', string>;
  connection: Record<Connection, string>;
  element: Record<Element | 'elder', string>;
  feature: Record<Feature, string>;
  ui: Record<
    | 'sample' | 'sampleShort' | 'sampleHint' | 'baron' | 'baronUp' | 'baronBuff' | 'elderBuff' | 'dragon' | 'dragonUp' | 'elderNext' | 'unknownElement'
    | 'soul' | 'inhibitor' | 'nexusTurret' | 'kills' | 'gold' | 'towersUnnamed' | 'towersUnknown'
    | 'settings' | 'done' | 'quit' | 'quitAgain' | 'noGame' | 'waiting',
    string
  >;
  set: Record<
    | 'title' | 'language' | 'auto' | 'background' | 'solid' | 'semi' | 'clear' | 'show' | 'goldView' | 'goldDiff' | 'goldTotals'
    | 'tickClock' | 'endpoint' | 'endpointBad' | 'endpointNote' | 'about' | 'aboutText',
    string
  >;
  /** "+2 not yet identified" next to a team's map corner. */
  unnamed(n: number): string;
}

const zh: Strings = {
  team: { B: '藍方', R: '紅方' },
  teamShort: { B: '藍', R: '紅' },
  status: { idle: '目前沒有進行中的比賽', waiting: '等待開局', in_game: '比賽中', finished: '本局結束' },
  statusShort: { waiting: '等待', finished: '結束' },
  connection: { connecting: '連線中', ok: '已連線', retrying: '連不到服務，重試中' },
  // 用語為一般玩家的叫法，尚未對照官方中文版。
  element: { infernal: '火龍', ocean: '水龍', mountain: '土龍', cloud: '風龍', hextech: '海克斯龍', chemtech: '化學龍', elder: '遠古龍' },
  feature: {
    clock: '遊戲時間', kills: '擊殺數', gold: '經濟差',
    towers: '防禦塔小地圖', nexusTimers: '主堡塔重生倒數', inhibitors: '水晶與重生倒數',
    dragons: '小龍', soul: '龍魂', nextDragon: '下一條龍與倒數',
    barons: '巴龍次數', nextBaron: '巴龍重生倒數', buffs: '巴龍／遠古龍增益倒數',
  },
  ui: {
    sample: '樣本資料', sampleShort: '樣本', sampleHint: '連不到 Stream CV 服務，顯示的是樣本資料（開發模式）',
    baron: '巴龍', baronUp: '巴龍在場', baronBuff: '巴龍增益', elderBuff: '遠古龍增益',
    dragon: '小龍', dragonUp: '小龍在場', elderNext: '遠古龍', unknownElement: '屬性未定',
    soul: '龍魂', inhibitor: '水晶', nexusTurret: '主堡塔', kills: '擊殺', gold: '經濟',
    towersUnnamed: '塔數由官方數據得知，是哪一座還沒辨識出來', towersUnknown: '沒有塔的辨識資料',
    settings: '設定', done: '完成', quit: '結束', quitAgain: '再按一次結束',
    noGame: '目前沒有進行中的比賽', waiting: '等待開局',
  },
  set: {
    title: '設定', language: '語言', auto: '跟隨系統', background: '背景', solid: '不透明', semi: '半透明', clear: '透明',
    show: '顯示項目', goldView: '經濟', goldDiff: '只顯示差距', goldTotals: '雙方總額',
    tickClock: '兩次更新之間時鐘繼續走', endpoint: '資料來源', endpointBad: '網址格式不對，沒有儲存',
    endpointNote: 'Stream CV 服務的 state.json，每 5 秒讀一次。',
    about: '關於',
    aboutText: '非官方工具，與 Riot Games 無關。龍、巴龍、水晶、擊殺、經濟來自官方數據；「哪一座塔」來自畫面辨識，可能延遲或缺漏。',
  },
  unnamed: (n) => `+${n}?`,
};

const en: Strings = {
  team: { B: 'Blue', R: 'Red' },
  teamShort: { B: 'B', R: 'R' },
  status: { idle: 'No game in progress', waiting: 'Waiting for the game', in_game: 'Live', finished: 'Game over' },
  statusShort: { waiting: 'Soon', finished: 'Final' },
  connection: { connecting: 'Connecting', ok: 'Connected', retrying: "Can't reach the service, retrying" },
  element: { infernal: 'Infernal', ocean: 'Ocean', mountain: 'Mountain', cloud: 'Cloud', hextech: 'Hextech', chemtech: 'Chemtech', elder: 'Elder' },
  feature: {
    clock: 'Game clock', kills: 'Kills', gold: 'Gold lead',
    towers: 'Tower map', nexusTimers: 'Nexus turret respawns', inhibitors: 'Inhibitors and respawns',
    dragons: 'Dragons', soul: 'Dragon soul', nextDragon: 'Next dragon and timer',
    barons: 'Baron count', nextBaron: 'Baron timer', buffs: 'Baron / Elder buff timers',
  },
  ui: {
    sample: 'Sample data', sampleShort: 'Sample', sampleHint: "Can't reach the Stream CV service; showing sample data (dev mode)",
    baron: 'Baron', baronUp: 'Baron up', baronBuff: 'Baron buff', elderBuff: 'Elder buff',
    dragon: 'Dragon', dragonUp: 'Dragon up', elderNext: 'Elder', unknownElement: 'element not set',
    soul: 'Soul', inhibitor: 'Inhib', nexusTurret: 'Nexus', kills: 'Kills', gold: 'Gold',
    towersUnnamed: 'The tower count comes from the official feed; which tower has not been read yet', towersUnknown: 'No tower reading',
    settings: 'Settings', done: 'Done', quit: 'Quit', quitAgain: 'Click again to quit',
    noGame: 'No game in progress', waiting: 'Waiting for the game',
  },
  set: {
    title: 'Settings', language: 'Language', auto: 'System', background: 'Background', solid: 'Solid', semi: 'Translucent', clear: 'Clear',
    show: 'Show', goldView: 'Gold', goldDiff: 'Lead only', goldTotals: 'Both totals',
    tickClock: 'Keep the clock running between updates', endpoint: 'Data source', endpointBad: "That address doesn't look right; not saved",
    endpointNote: "The Stream CV service's state.json, read every 5 seconds.",
    about: 'About',
    aboutText: 'Unofficial; not affiliated with Riot Games. Dragons, barons, inhibitors, kills and gold come from the official feed; which tower fell is read from the broadcast and can be late or missing.',
  },
  unnamed: (n) => `+${n}?`,
};

export const STRINGS: Record<Lang, Strings> = { 'zh-Hant': zh, en };
