// The main window's side of the notification window: makes it on first use (never focused, so
// typing elsewhere is not interrupted), forwards notices, and keeps it exactly as tall as its
// content in the bottom-right corner of the screen the main window is on (UI_SPEC §2).

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor } from '@tauri-apps/api/window';
import type { Notice } from '../events/dispatch.ts';

const LABEL = 'notify';
const WIDTH = 316, MARGIN = 12, MAX_H = 260;

export class Notifier {
  private ready: Promise<void> | null = null;
  private height = 0;
  /** "+{n} 則 ▸" in the user's language. */
  more = '+{n} ▸';
  /** Bottom-right (spec), or top-right when Windows' own notifications cover the bottom corner. */
  corner: 'br' | 'tr' = 'br';

  constructor() {
    void listen<number>('notify-height', (e) => { this.height = Math.min(MAX_H, e.payload); void this.place(); });
  }

  async push(items: Notice[]): Promise<void> {
    if (!items.length) return;
    try {
      await this.open();
      await emitTo(LABEL, 'notices', { items, more: this.more });
    } catch (e) {
      console.warn('notification window:', e);
    }
  }

  async clear(): Promise<void> {
    if (this.ready) await emitTo(LABEL, 'notices-clear', null).catch(() => undefined);
  }

  private open(): Promise<void> {
    this.ready ??= new Promise<void>((resolve, reject) => {
      let unlisten: (() => void) | undefined;
      const timer = setTimeout(() => { unlisten?.(); reject(new Error('notification window did not start')); }, 15_000);
      void listen('notify-ready', () => { clearTimeout(timer); unlisten?.(); resolve(); }).then((u) => { unlisten = u; });
      const w = new WebviewWindow(LABEL, {
        url: 'notify.html', width: WIDTH, height: 40, visible: false, focus: false, focusable: false,
        decorations: false, transparent: true, shadow: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, title: 'DesktopLOL',
      });
      void w.once('tauri://error', (e) => { clearTimeout(timer); reject(new Error(String(e.payload))); });
    });
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }

  /** A corner of the work area, as tall as the content; hidden when empty. */
  private async place(): Promise<void> {
    const w = await WebviewWindow.getByLabel(LABEL);
    if (!w) return;
    if (this.height <= 0) { await w.hide(); return; }
    const mon = await currentMonitor();
    if (!mon) return;
    const s = mon.scaleFactor;
    const area = { x: mon.workArea.position.x / s, y: mon.workArea.position.y / s, w: mon.workArea.size.width / s, h: mon.workArea.size.height / s };
    await w.setSize(new LogicalSize(WIDTH, this.height));
    const y = this.corner === 'tr' ? area.y + MARGIN : area.y + area.h - this.height - MARGIN;
    await w.setPosition(new LogicalPosition(Math.round(area.x + area.w - WIDTH - MARGIN), Math.round(y)));
    await w.show();
  }
}
