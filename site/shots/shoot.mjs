// The site's pictures of the app, drawn headless (Edge over the DevTools protocol, like scripts/screenshots.mjs):
// the bar from the app's own page with the bundled sample, the other windows from harness.html.
// Needs the app's dev server: `npx vite --port 1441` in the repository root.
// Usage: node site/shots/shoot.mjs   (writes site/media/app-*.png)

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE ?? 'http://localhost:1441/';
const OUT = process.argv[2] ?? 'site/media';
const H = 'site/shots/harness.html';
// The bar is drawn at 72% until something happens; the pictures show it lit, as it is right after a play.
// The injected Baron is stamped 10:00 (the aid reads the clock before the sample has loaded); the picture
// gives it the sample's Baron time (its buff has 1:55 left at 33:10) instead.
const LIT = "document.getElementById('bar')?.classList.add('lit'); document.querySelectorAll('#rowB .t').forEach((t) => { t.textContent = '32:05'; })";

// name, page, CSS width, height, scale, script to run before the picture
const SHOTS = [
  ['app-bar-zh', '?sample=1&demo=1&inject=baron:2.5&set=language:zh-Hant', 340, 48, 3, LIT],
  ['app-bar-en', '?sample=1&demo=1&inject=baron:2.5&set=language:en', 340, 48, 3, LIT],
  ['app-notices-zh', `${H}?view=notices&lang=zh-Hant`, 304, 172, 3, ''],
  ['app-notices-en', `${H}?view=notices&lang=en`, 304, 172, 3, ''],
  ['app-minimap-zh', `${H}?view=minimap&lang=zh-Hant`, 188, 150, 3, ''],
  ['app-minimap-en', `${H}?view=minimap&lang=en`, 188, 150, 3, ''],
  ['app-players-zh', `${H}?view=players&lang=zh-Hant`, 320, 150, 3, ''],
  ['app-players-en', `${H}?view=players&lang=en`, 320, 150, 3, ''],
  ['app-draft-zh', `${H}?view=draft&lang=zh-Hant`, 300, 100, 3, ''],
  ['app-draft-en', `${H}?view=draft&lang=en`, 300, 100, 3, ''],
  // The link previews, from the pictures above (so they go last).
  ['og', 'site/shots/og.html', 1200, 630, 1, ''],
  ['og-en', 'site/shots/og.html?lang=en', 1200, 630, 1, ''],
];

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'smallol-site-shots-'));
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
  const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
  for (const [name, query, w, h, scale, before] of SHOTS.filter(([n]) => !only.length || only.some((o) => n.includes(o)))) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    await send('Page.navigate', { url: BASE + query });
    await new Promise((r) => setTimeout(r, 4000));
    if (before) await send('Runtime.evaluate', { expression: before });
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    const { result } = await send('Runtime.evaluate', { expression: 'innerWidth + "x" + innerHeight' });
    console.log(`${name}.png  viewport ${result.value} @${scale}x`);
  }
  close();
} finally {
  edge.kill();
}
// Edge's helper processes can keep this script alive after the main one is gone.
process.exit(0);
