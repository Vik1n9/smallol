// What the main window sends the optional windows. Plain data, so it survives Tauri's JSON events.
// The main window stays the only owner of the game and the settings; the windows draw what they
// get and send clicks back (docs/UI_SPEC_v1.md §6).

import type { Connection } from '../data/streamcv/source.ts';
import type { DataTab } from '../i18n/bar.ts';
import type { Lang } from '../i18n/index.ts';
import type { History } from '../model/history.ts';
import type { RosterTeam } from '../model/roster.ts';
import type { Schedule } from '../model/schedule.ts';
import type { MatchState } from '../model/types.ts';
import type { PanelName, Settings } from '../settings/schema.ts';

export interface PanelFrame {
  state: MatchState;
  /** When the state arrived (ms), so the window's clock ticks on its own. */
  receivedAt: number;
  settings: Settings;
  lang: Lang;
  conn: Connection;
  sample: boolean;
  schedule: Schedule | null;
  history: History;
  roster: Record<string, RosterTeam> | null;
  pickedMatch: string | null;
  dataTab: DataTab;
  endpointError: boolean;
}

/** A click in a window, as the element's data-* attributes. */
export type PanelAction = Record<string, string> & { panel: PanelName };

export const panelLabel = (name: PanelName) => `panel-${name}`;

/** Logical sizes the windows open at (UI_SPEC §6). The user can resize; the window remembers. */
export const PANEL_SIZE: Record<PanelName, { w: number; h: number }> = {
  minimap: { w: 220, h: 176 }, draftGame: { w: 300, h: 100 }, players: { w: 320, h: 150 }, data: { w: 340, h: 360 },
};
