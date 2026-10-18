// Words for the sentinel bar, the notification modes, the panels and the data window
// (docs/UI_SPEC_v1.md). Kept apart from index.ts so the redesign's strings stay together; same
// rule: one typed record per language, a key missing in either fails the type check.

import type { EventKind } from '../events/kinds.ts';
import type { Channel, NotifyBase, NotifyMode, PanelName } from '../settings/schema.ts';
import type { Lang } from './index.ts';

export type DataTab = 'schedule' | 'series' | 'settings';

export interface BarStrings {
  mode: Record<NotifyMode, string>;
  modeHint: Record<'work' | 'companion', string>;
  customOf(base: string): string;
  base: Record<NotifyBase, string>;
  channel: Record<Channel, string>;
  event: Record<EventKind, string>;
  panel: Record<PanelName, string>;
  tab: Record<DataTab, string>;
  icon: Record<'mode' | 'panels' | 'data' | 'pause' | 'resume' | 'tier' | 'settings', string>;
  ask: string;
  feedback: { mode(m: string): string; paused: string; resumed: string };
  more: string;
  draftOn(game: number): string;
  between(game: number): string;
  seasonOver: string;
  picksSoFar(n: number): string;
  inProgress(clock: string): string;
  startingSoon: string;
  reset: string;
  sections: Record<'notify' | 'events' | 'panels' | 'reminder' | 'general' | 'corner' | 'soon' | 'milestones', string>;
  milestones: Record<'all' | 'mine', string>;
  seconds(n: number): string;
  corner: Record<'br' | 'tr', string>;
  /** An objective that has spawned, on the bar's countdown chips. */
  up: string;
  minutes(n: number): string;
  atStart: string;
}

const zh: BarStrings = {
  mode: { work: '上班', companion: '陪看', custom: '自訂' },
  modeHint: { work: '我沒在看轉播，告訴我戰況', companion: '我開著轉播，只補轉播沒說的' },
  customOf: (b) => `自訂（基於 ${b}）`,
  base: { work: '上班', companion: '陪看', major: '只留大事' },
  channel: { off: '不顯示', log: '只進 log', strip: '小條', card: '卡片' },
  event: {
    reminder: '開賽提醒', ban: '逐手禁用', pick: '逐手選角', bpDone: 'BP 完成', gameStart: '一局開打', gameEnd: '一局結束', seriesEnd: '系列賽結束',
    tower: '外塔、內塔', inhibTower: '高地塔', nexusTower: '主堡塔', inhibitor: '水晶被破',
    drake: '小龍', herald: '預示者', grubs: '三蟲', soul: '龍魂', elder: '遠古龍', baron: '巴龍',
    bpStart: '下一局 BP 開始', inhibRespawn: '水晶重生', nexusRespawn: '主堡塔重生', soulPoint: '龍魂聽牌',
    dragonSoon: '小龍即將出現', bossSoon: '巴龍、遠古龍即將出現', baronBuffEnding: '巴龍增益剩 30 秒',
    kill: '單殺與陣亡', goldLead5k: '經濟領先 5k', goldLead10k: '經濟領先 10k', goldFlip: '經濟反超',
    level6: '升 6 級', level11: '升 11、16 級', firstLegendary: '第一件傳說裝',
  },
  panel: { minimap: '小地圖', draftGame: '本局 BP', players: '選手面板', data: '資料窗' },
  tab: { schedule: '賽程', series: '全場 BP', settings: '設定' },
  icon: { mode: '通知模式', panels: '面板', data: '資料窗', pause: '暫停通知 30 分鐘', resume: '恢復通知', tier: '切換大小', settings: '設定' },
  ask: '你怎麼用這個小工具？之後可以從模式標籤改。',
  feedback: { mode: (m) => `通知模式：${m}`, paused: '通知已暫停 30 分鐘', resumed: '通知已恢復' },
  more: '+{n} 則 ▸',
  draftOn: (g) => `BP 進行中 · 第 ${g} 局`,
  between: (g) => `第 ${g} 局準備中`,
  seasonOver: '賽事已結束',
  picksSoFar: (n) => `已 ${n} 手`,
  inProgress: (c) => `已進行 ${c}`,
  startingSoon: '即將開打',
  reset: '重設為',
  sections: { notify: '通知模式', events: '事件', panels: '面板', reminder: '開賽提醒', general: '一般', corner: '通知位置', soon: '即將出現', milestones: '升級與出裝' },
  milestones: { all: '全部選手', mine: '只我的隊伍' },
  seconds: (n) => `${n} 秒前`,
  corner: { br: '右下', tr: '右上' },
  up: '在場',
  minutes: (n) => `${n} 分`,
  atStart: '開打時',
};

const en: BarStrings = {
  mode: { work: 'Work', companion: 'Watching', custom: 'Custom' },
  modeHint: { work: "I'm not watching: tell me how it goes", companion: "I'm watching: only what the broadcast doesn't say" },
  customOf: (b) => `Custom (from ${b})`,
  base: { work: 'Work', companion: 'Watching', major: 'Big events only' },
  channel: { off: 'Off', log: 'Log only', strip: 'Strip', card: 'Card' },
  event: {
    reminder: 'Match reminder', ban: 'Each ban', pick: 'Each pick', bpDone: 'Draft complete', gameStart: 'Game begins', gameEnd: 'Game over', seriesEnd: 'Series over',
    tower: 'Outer, inner turrets', inhibTower: 'Inhibitor turrets', nexusTower: 'Nexus turrets', inhibitor: 'Inhibitor destroyed',
    drake: 'Drakes', herald: 'Herald', grubs: 'Void Grubs', soul: 'Dragon Soul', elder: 'Elder Dragon', baron: 'Baron',
    bpStart: 'Next draft begins', inhibRespawn: 'Inhibitor respawns', nexusRespawn: 'Nexus turret respawns', soulPoint: 'One drake from Soul',
    dragonSoon: 'Drake spawning soon', bossSoon: 'Baron, Elder spawning soon', baronBuffEnding: 'Baron buff 30s left',
    kill: 'Solo kills and deaths', goldLead5k: 'Gold lead 5k', goldLead10k: 'Gold lead 10k', goldFlip: 'Gold lead changes hands',
    level6: 'Level 6', level11: 'Levels 11, 16', firstLegendary: 'First legendary item',
  },
  panel: { minimap: 'Minimap', draftGame: 'Draft', players: 'Players', data: 'Data' },
  tab: { schedule: 'Schedule', series: 'Series draft', settings: 'Settings' },
  icon: { mode: 'Notification mode', panels: 'Panels', data: 'Data window', pause: 'Pause notifications for 30 min', resume: 'Resume notifications', tier: 'Change size', settings: 'Settings' },
  ask: 'How will you use this? You can change it later from the mode label.',
  feedback: { mode: (m) => `Notifications: ${m}`, paused: 'Notifications paused for 30 min', resumed: 'Notifications back on' },
  more: '+{n} more ▸',
  draftOn: (g) => `Draft · Game ${g}`,
  between: (g) => `Game ${g} up next`,
  seasonOver: 'Event over',
  picksSoFar: (n) => `${n} done`,
  inProgress: (c) => `In progress ${c}`,
  startingSoon: 'Starting soon',
  reset: 'Reset to',
  sections: { notify: 'Notifications', events: 'Events', panels: 'Panels', reminder: 'Match reminder', general: 'General', corner: 'Notices at', soon: 'Spawning soon', milestones: 'Levels, items' },
  milestones: { all: 'Every player', mine: 'My team only' },
  seconds: (n) => `${n}s ahead`,
  corner: { br: 'Bottom right', tr: 'Top right' },
  up: 'up',
  minutes: (n) => `${n} min`,
  atStart: 'At start',
};

export const BAR_STRINGS: Record<Lang, BarStrings> = { 'zh-Hant': zh, en };
