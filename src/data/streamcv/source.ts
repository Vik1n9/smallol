// Polls the Stream CV service: one request at a time, every 5 s (the service's own update rate),
// backing off with jitter when it fails. Never caches: a stale copy would put the widget behind
// the broadcast (Basesmall measured 17 s -> 13 s with `cache: 'no-cache'`).

import { adapt } from './adapter.ts';
import type { MatchState } from '../../model/types.ts';

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787/state.json';
export const INTERVAL_MS = 5000;
const TIMEOUT_MS = 4000;
const MAX_BACKOFF_MS = 60_000;

export type Connection = 'connecting' | 'ok' | 'retrying';

export interface SourceDeps {
  fetch: typeof fetch;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
  random: () => number;
}

export interface SourceEvents {
  onState(state: MatchState, receivedAt: number): void;
  onConnection(c: Connection, failures: number): void;
}

/** Delay before the next try after `failures` failures in a row: 5 s, 10 s, 20 s ... 60 s, ±20 %. */
export function backoff(failures: number, random: () => number): number {
  const base = Math.min(MAX_BACKOFF_MS, INTERVAL_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

export class StateSource {
  private url: string;
  private readonly deps: SourceDeps;
  private readonly events: SourceEvents;
  private timer: unknown = null;
  private inFlight = false;
  private running = false;
  private failures = 0;

  constructor(url: string, events: SourceEvents, deps?: Partial<SourceDeps>) {
    this.url = url;
    this.events = events;
    this.deps = {
      fetch: (...a) => fetch(...a),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      random: Math.random,
      ...deps,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.events.onConnection('connecting', 0);
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
  }

  /** A new endpoint (settings): ask it right away. */
  setUrl(url: string): void {
    if (url === this.url) return;
    this.url = url;
    this.failures = 0;
    if (!this.running) return;
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
    this.events.onConnection('connecting', 0);
    if (!this.inFlight) void this.tick();
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    this.timer = this.deps.setTimeout(() => { this.timer = null; void this.tick(); }, ms);
  }

  private async tick(): Promise<void> {
    if (this.inFlight || !this.running) return;
    this.inFlight = true;
    const url = this.url;
    const abort = new AbortController();
    const kill = this.deps.setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await this.deps.fetch(url, { cache: 'no-cache', signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      if (url !== this.url) return;
      this.failures = 0;
      this.events.onConnection('ok', 0);
      this.events.onState(adapt(body), this.deps.now());
      this.schedule(INTERVAL_MS);
    } catch {
      if (url !== this.url) return;
      this.failures += 1;
      this.events.onConnection('retrying', this.failures);
      this.schedule(backoff(this.failures, this.deps.random));
    } finally {
      this.deps.clearTimeout(kill);
      this.inFlight = false;
      // The endpoint changed while this request was out: ask the new one now.
      if (url !== this.url && this.running && this.timer === null) void this.tick();
    }
  }
}
