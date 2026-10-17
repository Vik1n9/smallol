// Screenshots of the UI at exact window sizes, through the DevTools protocol of a headless Edge
// (plain `--screenshot` forces a ~500 px minimum width). Needs `npm run dev` running.
// Usage: [ONLY=word,word] node scripts/screenshots.mjs [outDir]

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE ?? 'http://localhost:1430/';
const OUT = process.argv[2] ?? 'docs/screenshots';

const SHOTS = [
  ['map-live-zh', '?sample=1&demo=1&set=language:zh-Hant', 480, 236],
  ['map-live-en', '?sample=1&demo=1&set=language:en', 480, 236],
  ['map-finished-zh', '?sample=1&set=language:zh-Hant', 480, 236],
  ['map-live-semi-zh', '?sample=1&demo=1&set=language:zh-Hant,background:semi', 480, 236],
  ['views-both-zh', '?sample=1&demo=1&set=language:zh-Hant,views.draftGame:true,views.draftSeries:true', 480, 236 + 138 + 156],
  ['views-both-en', '?sample=1&demo=1&set=language:en,views.draftGame:true,views.draftSeries:true', 480, 236 + 138 + 156],
  ['players-zh', '?sample=1&demo=1&set=language:zh-Hant,views.players:true', 480, 236 + 424],
  ['players-en', '?sample=1&demo=1&set=language:en,views.players:true', 480, 236 + 424],
  ['players-noitems-zh', '?sample=1&demo=1&set=language:zh-Hant,views.players:true,show.playerItems:false', 480, 236 + 294],
  ['draft-zh', '?sample=1&demo=1&set=language:zh-Hant,views.draftGame:true', 480, 236 + 138],
  ['draft-waiting-zh', '?sample=draft&set=language:zh-Hant,views.draftGame:true,views.draftSeries:true', 480, 236 + 138 + 156],
  ['bar-live-zh', '?sample=1&demo=1&set=language:zh-Hant', 480, 90],
  ['dot-zh', '?sample=1&set=language:zh-Hant', 260, 30],
  ['settings-zh', '?sample=1&settings=1&set=language:zh-Hant', 440, 500],
  ['idle-next-zh', '?set=language:zh-Hant', 480, 236],
  ['idle-next-en', '?set=language:en', 480, 236],
  ['idle-bar-zh', '?set=language:zh-Hant', 480, 90],
  ['idle-dot-zh', '?set=language:zh-Hant', 420, 30],
  ['schedule-zh', '?set=language:zh-Hant,views.schedule:true', 480, 236 + 214],
  ['schedule-pick-zh', '?set=language:zh-Hant,views.schedule:true&pick=next', 480, 236 + 240],
  ['draft-tend-zh', '?sample=1&demo=1&set=language:zh-Hant,views.draftGame:true', 480, 236 + 234],
  ['schedule-spoilers-zh', '?set=language:zh-Hant,views.schedule:true,spoilerFree:false', 480, 236 + 214],
];

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'desktoplol-shots-'));
// Port 0: Edge picks a free port (a fixed one can fall in a range Windows reserves) and writes it down.
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let PORT = 0;

async function waitForDevtools() {
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    if (existsSync(file)) {
      PORT = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch { /* not yet */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Edge did not open its DevTools port');
}

async function session() {
  const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, close: () => ws.close() };
}

try {
  await waitForDevtools();
  const { send, close } = await session();
  await send('Page.enable');
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  // ONLY=schedule,idle shoots just the names containing one of those words.
  const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
  for (const [name, query, w, h] of SHOTS.filter(([n]) => !only.length || only.some((o) => n.includes(o)))) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: BASE + query });
    await new Promise((r) => setTimeout(r, 2500));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    const { result } = await send('Runtime.evaluate', { expression: 'innerWidth + "x" + innerHeight' });
    console.log(`${name}.png  viewport ${result.value}`);
  }
  close();
} finally {
  edge.kill();
}
