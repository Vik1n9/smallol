import { describe, expect, it } from 'vitest';
import { backoff, INTERVAL_MS, StateSource, type Connection } from '../src/data/streamcv/source.ts';
import type { MatchState } from '../src/model/types.ts';

/** A clock and timer queue the test drives by hand. */
function harness(responses: (() => Promise<Response>)[]) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const calls: { url: string; init?: RequestInit }[] = [];
  let inFlight = 0, maxInFlight = 0;
  const states: MatchState[] = [];
  const conns: Connection[] = [];
  const src = new StateSource('http://svc/state.json', {
    onState: (s) => states.push(s),
    onConnection: (c) => conns.push(c),
  }, {
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      try { return await (responses.shift() ?? (() => Promise.reject(new Error('none'))))(); } finally { inFlight--; }
    }) as typeof fetch,
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    now: () => now,
    random: () => 0.5,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Move the clock to the next timer that would make a request and run it. */
  async function advance() {
    await flush();
    timers.sort((a, b) => a.at - b.at);
    // Timeouts guard requests; run the poll timer (the one that is not a request timeout).
    const t = timers.shift();
    if (!t) return null;
    const waited = t.at - now;
    now = t.at;
    t.fn();
    await flush(); await flush();
    return waited;
  }
  return { src, calls, states, conns, advance, flush, maxInFlight: () => maxInFlight, timers };
}

const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = () => () => Promise.reject(new Error('ECONNREFUSED'));

describe('state source', () => {
  it('asks every 5 s, one request at a time, without the HTTP cache', async () => {
    const h = harness([ok({ status: 'in_game', gameClock: '1:00' }), ok({ status: 'in_game', gameClock: '1:05' })]);
    h.src.start();
    await h.flush(); await h.flush();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.init?.cache).toBe('no-cache');
    expect(h.states.map((s) => s.clock)).toEqual([60]);
    expect(h.conns).toEqual(['connecting', 'ok']);
    expect(await h.advance()).toBe(INTERVAL_MS);
    expect(h.calls).toHaveLength(2);
    expect(h.states.map((s) => s.clock)).toEqual([60, 65]);
    expect(h.maxInFlight()).toBe(1);
    h.src.stop();
  });

  it('backs off after failures and recovers', async () => {
    const h = harness([fail(), fail(), ok({ status: 'idle' })]);
    h.src.start();
    await h.flush(); await h.flush();
    expect(h.conns.at(-1)).toBe('retrying');
    expect(await h.advance()).toBe(5000);
    expect(await h.advance()).toBe(10000);
    expect(h.conns.at(-1)).toBe('ok');
    expect(h.states).toHaveLength(1);
    h.src.stop();
  });

  it('backoff doubles up to a minute, with jitter', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => backoff(n, mid))).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
    expect(backoff(1, () => 0)).toBe(4000);
    expect(backoff(1, () => 1)).toBe(6000);
  });
});
