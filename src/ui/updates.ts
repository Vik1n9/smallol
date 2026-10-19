// New versions (from Basesmall). An installed copy (the Windows installer) updates itself through
// Tauri's updater, only when the user presses Update; a portable copy (the zip) gets the download page.
// When to ask is main.ts's business: once after start-up (setting updateCheck), or from the settings.

import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { newerRelease } from './version.ts';

export type InstallKind = 'installed' | 'portable' | 'other';

export interface Newer {
  /** "v0.1.1". */
  tag: string;
  /** Set when this copy can install it itself. */
  update?: Update;
}

/** A newer release, if there is one. Never throws. */
export async function findNewer(current: string): Promise<Newer | null> {
  const kind = await invoke<InstallKind>('install_kind').catch((): InstallKind => 'other');
  if (kind === 'installed') {
    try {
      const u = await check({ timeout: 15_000 });
      return u ? { tag: `v${u.version}`, update: u } : null;
    } catch {
      // No update file for this release, or no network: the plain check below still finds the page.
    }
  }
  return newerRelease(current);
}

/** Download, check the signature, install, start the new version. `progress` gets 0–100, or null while the size is unknown. */
export async function installNewer(n: Newer, progress: (pct: number | null) => void): Promise<void> {
  if (!n.update) throw new Error('nothing to install');
  let total = 0, got = 0;
  await n.update.downloadAndInstall((e) => {
    if (e.event === 'Started') total = e.data.contentLength ?? 0;
    else if (e.event === 'Progress') { got += e.data.chunkLength; progress(total ? Math.min(100, Math.round((got / total) * 100)) : null); }
    else progress(100);
  });
  await relaunch();
}

/** The release's page in the browser (the shell builds the address from the tag; nothing else can be opened). */
export const openReleasePage = (tag: string) => invoke('open_release_page', { tag }).catch(() => undefined);
