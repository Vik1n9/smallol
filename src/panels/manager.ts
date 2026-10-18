// Opens, closes, places and feeds the optional windows (docs/UI_SPEC_v1.md §6): minimap, this game's
// draft, players, and the data window. Each is its own window the user places; the first time it
// opens beside the main window (Basesmall's column rule), afterwards where the user left it.

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { PANELS, type PanelName, type Size } from '../settings/schema.ts';
import { panelLabel, PANEL_SIZE, type PanelFrame } from './frame.ts';

export class Panels {
  private readonly open = new Map<PanelName, Promise<void>>();
  private frame: PanelFrame | null = null;
  private readonly sizeOf: (name: PanelName) => Size;

  constructor(sizeOf: (name: PanelName) => Size) {
    this.sizeOf = sizeOf;
    // A window that starts (or restarts) asks for the current frame.
    void listen<PanelName>('panel-ready', (e) => {
      if (this.frame) void emitTo(panelLabel(e.payload), 'panel-frame', this.frame);
    });
  }

  private latest: Record<PanelName, boolean> | null = null;
  private syncing: Promise<void> | null = null;

  /** Make the open windows match the settings; only the newest wish is applied. */
  sync(wanted: Record<PanelName, boolean>): Promise<void> {
    this.latest = wanted;
    this.syncing ??= (async () => {
      while (this.latest) {
        const w = this.latest;
        this.latest = null;
        await this.apply(w);
      }
      this.syncing = null;
    })();
    return this.syncing;
  }

  private async apply(wanted: Record<PanelName, boolean>): Promise<void> {
    for (const name of PANELS) {
      if (wanted[name] && !this.open.has(name)) this.open.set(name, this.create(name));
      if (!wanted[name] && this.open.has(name)) {
        const creating = this.open.get(name);
        this.open.delete(name);
        await creating?.catch(() => undefined);
        await (await WebviewWindow.getByLabel(panelLabel(name)))?.close();
      }
    }
  }

  /** Send the current game and settings to every open window. */
  send(frame: PanelFrame): void {
    this.frame = frame;
    for (const name of this.open.keys()) void emitTo(panelLabel(name), 'panel-frame', frame);
  }

  private hidden = false;
  /**
   * Put every open window out of sight and back (low-key, the hide hotkey). Hidden, not closed: they come
   * back where they were, as big as they were, and a window opened meanwhile starts hidden.
   */
  async setHidden(hidden: boolean): Promise<void> {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    for (const [name, creating] of this.open) {
      await creating.catch(() => undefined);
      const w = await WebviewWindow.getByLabel(panelLabel(name));
      if (hidden) await w?.hide(); else await w?.show();
    }
  }

  /** Bring the data window forward (it is the one window that takes focus: its search and fields need keys).
   * Shown even while the others are put away: low-key is left from its settings tab. */
  async focusData(): Promise<void> {
    await this.open.get('data');
    const w = await WebviewWindow.getByLabel(panelLabel('data'));
    if (this.hidden) await w?.show();
    await w?.setFocus().catch(() => undefined);
  }

  private async create(name: PanelName): Promise<void> {
    const size = this.sizeOf(name);
    const main = getCurrentWindow();
    const scale = await main.scaleFactor();
    const pos = (await main.outerPosition()).toLogical(scale);
    const mainSize = (await main.outerSize()).toLogical(scale);
    // Columns beside the main window, each window below the one before; a window that would pass
    // the bottom of the screen starts the next column.
    const mon = await currentMonitor();
    const bottom = mon ? (mon.position.y + mon.size.height) / mon.scaleFactor : Infinity;
    let x = pos.x + mainSize.width + 8, y = pos.y, colW = 0;
    for (const p of PANELS) {
      const s = this.sizeOf(p);
      if (y > pos.y && y + s.h > bottom) { x += colW + 8; y = pos.y; colW = 0; }
      if (p === name) break;
      y += s.h + 8;
      colW = Math.max(colW, s.w);
    }
    const data = name === 'data';
    await new Promise<void>((resolve) => {
      const w = new WebviewWindow(panelLabel(name), {
        url: `panel.html#${name}`,
        x: Math.round(x), y: Math.round(y),
        width: size.w, height: size.h, minWidth: 120, minHeight: 60,
        // Only the data window can take focus (its fields need the keyboard), and only when the user opens it
        // (focusData): restored at start it must not take focus from what the user is doing.
        focus: false, focusable: data, visible: !this.hidden,
        decorations: false, transparent: true, shadow: false, resizable: true,
        alwaysOnTop: true, skipTaskbar: true, title: 'SmalLoL',
      });
      void w.once('tauri://created', () => resolve());
      void w.once('tauri://error', () => resolve());
      const started = Date.now();
      const poll = setInterval(() => {
        void WebviewWindow.getByLabel(panelLabel(name)).then((found) => {
          if (found || Date.now() - started > 5000) { clearInterval(poll); resolve(); }
        });
      }, 50);
    });
  }
}

export { PANEL_SIZE };
