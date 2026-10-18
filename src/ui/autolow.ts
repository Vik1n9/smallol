// Presentation detection (docs/UI_SPEC_batch3.md §6): what Windows says about notifications, asked
// every 2 seconds, turns low-key on by itself and off again. Pure: the states come in, tests drive it.

/** src-tauri's notify_state: busy (full screen), d3d (full-screen game), presentation, quiet (quiet
 * hours), app (full-screen Store app), away (screen saver, locked), ok. */
export type OsState = 'busy' | 'd3d' | 'presentation' | 'quiet' | 'app' | 'away' | 'ok';
export const OS_STATES: readonly OsState[] = ['busy', 'd3d', 'presentation', 'quiet', 'app', 'away', 'ok'];

/**
 * Which states turn it on, by the mode the user chose: at work every full-screen kind; watching along,
 * only presenting and quiet hours (their own full-screen stream is expected). Away never does.
 */
export const TRIGGERS: Record<'work' | 'companion', readonly OsState[]> = {
  work: ['busy', 'd3d', 'presentation', 'quiet', 'app'],
  companion: ['presentation', 'quiet'],
};

/** Clear checks in a row before it turns off again (about 6 s): switching windows does not flicker it. */
export const CLEAR_TO_LEAVE = 3;

export class AutoLow {
  /** Low-key turned on by detection (never saved). */
  on = false;
  private clear = 0;
  /** Left by hand while on: not again until a clear check has come. */
  private blocked = false;

  /** One check. Returns whether `on` changed. */
  step(state: OsState, mode: 'work' | 'companion', enabled: boolean): boolean {
    const was = this.on;
    if (!enabled) { this.on = false; this.clear = 0; this.blocked = false; return was !== this.on; }
    if (TRIGGERS[mode].includes(state)) {
      this.clear = 0;
      if (!this.on && !this.blocked) this.on = true;
    } else {
      this.blocked = false;
      this.clear += 1;
      if (this.on && this.clear >= CLEAR_TO_LEAVE) this.on = false;
    }
    return was !== this.on;
  }

  /** The user left low-key by hand (double click, hotkey, tray, settings) while detection had it on. */
  leaveByHand(): void {
    if (!this.on) return;
    this.on = false;
    this.blocked = true;
    this.clear = 0;
  }
}

/** The detection set for a mode; custom follows what it started from ('major' counts as work). */
export const detectionMode = (mode: 'work' | 'companion' | 'custom', base: 'work' | 'companion' | 'major'): 'work' | 'companion' =>
  (mode === 'custom' ? base : mode) === 'companion' ? 'companion' : 'work';
