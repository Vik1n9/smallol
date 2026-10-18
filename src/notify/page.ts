// The page in the notification window (notify.html). Draws what the main window sends: cards and
// strips, each kept by id so an update changes it in place and old items never replay their
// entrance. Reports its height so the main window can size the window to it (no empty, see-through
// area that would catch clicks meant for the desktop underneath).

import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';
import type { Notice } from '../events/dispatch.ts';

const stack = document.getElementById('stack')!;
const LIFE = { card: 8000, strip: 4000 } as const;
/** At most two cards and three strips at once (UI_SPEC §2); more strips fold into "+N". */
const MAX_CARDS = 2, MAX_STRIPS = 3;

interface Item { n: Notice; el: HTMLElement; left: number; gone: boolean }
const items = new Map<string, Item>();
let overflow = 0;
let overflowLeft = 0;
let moreLabel = (n: number) => `+${n} ▸`;
let hovering = false;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function fill(el: HTMLElement, n: Notice): void {
  el.className = `item ${n.kind}${n.tall ? ' tall' : ''}${n.team ? ` ${n.team}` : ''}`;
  const time = n.time ? `<span class="time">${esc(n.time)}</span>` : '';
  if (n.kind === 'card') {
    const sub = n.sub ? `<span class="sub${n.tall && n.sub.length > 40 ? ' tight' : ''}">${esc(n.sub)}</span>` : '';
    el.innerHTML = `<div class="head"><span class="title">${esc(n.title)}</span>${time}</div>${sub}`;
  } else {
    el.innerHTML = `<span class="title">${esc(n.title)}</span>${time}`;
  }
}

function retire(it: Item): void {
  if (it.gone) return;
  it.gone = true;
  it.el.classList.add('out');
  setTimeout(() => { it.el.remove(); items.delete(it.n.id); report(); }, 160);
}

function live(kind: 'card' | 'strip'): Item[] {
  return [...items.values()].filter((x) => !x.gone && x.n.kind === kind);
}

function upsert(n: Notice): void {
  const it = items.get(n.id);
  if (it && !it.gone) {
    const before = it.n.title;
    it.n = n; it.left = LIFE[n.kind];
    fill(it.el, n);
    if (before !== n.title) it.el.querySelector('.title')?.classList.add('bump');
    return;
  }
  // Room for it: the oldest card leaves early; the oldest strip folds into the "+N" strip.
  if (n.kind === 'card') { const cs = live('card'); if (cs.length >= MAX_CARDS) retire(cs[0]!); }
  else { const ss = live('strip'); if (ss.length >= MAX_STRIPS) { retire(ss[0]!); overflow += 1; overflowLeft = LIFE.strip; drawMore(); } }
  const el = document.createElement('div');
  el.dataset.id = n.id;
  fill(el, n);
  stack.appendChild(el);
  items.set(n.id, { n, el, left: LIFE[n.kind], gone: false });
}

function drawMore(): void {
  let el = stack.querySelector<HTMLElement>('.more');
  if (overflow <= 0) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'item strip more'; stack.prepend(el); }
  el.innerHTML = `<span class="title">${esc(moreLabel(overflow))}</span>`;
}

let last = '';
/**
 * The window is exactly as big as what it shows: as tall as the stack and as wide as its widest item,
 * so no see-through margin beside the strips catches clicks meant for the desktop (batch 1 review,
 * check 2: a 316-wide window with 260-wide strips took the clicks on its empty left part).
 */
function report(): void {
  requestAnimationFrame(() => {
    const kids = [...stack.children] as HTMLElement[];
    const h = kids.length ? Math.ceil(stack.getBoundingClientRect().height) : 0;
    const w = kids.length ? Math.max(...kids.map((k) => Math.ceil(k.getBoundingClientRect().width))) : 0;
    const key = `${w}x${h}`;
    if (key !== last) { last = key; void emit('notify-size', { w, h }); }
  });
}

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = now - lastTick;
  lastTick = now;
  if (hovering) return;
  for (const it of items.values()) if (!it.gone && (it.left -= dt) <= 0) retire(it);
  if (overflow && (overflowLeft -= dt) <= 0) { overflow = 0; drawMore(); report(); }
}, 200);

stack.addEventListener('mouseenter', () => { hovering = true; });
stack.addEventListener('mouseleave', () => { hovering = false; });
stack.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.item');
  if (!el) return;
  if (el.classList.contains('more')) { overflow = 0; drawMore(); void emit('notify-more'); report(); return; }
  const it = items.get(el.dataset.id ?? '');
  if (it) retire(it);
});

const self = getCurrentWebviewWindow();
void (async () => {
  await self.listen<{ items: Notice[]; more: string; corner: 'br' | 'tr' }>('notices', (e) => {
    moreLabel = (n) => e.payload.more.replace('{n}', String(n));
    document.body.classList.toggle('tr', e.payload.corner === 'tr');
    for (const n of e.payload.items) upsert(n);
    report();
  });
  await self.listen('notices-report', () => { last = ''; report(); });
  await self.listen('notices-clear', () => {
    for (const it of items.values()) retire(it);
    overflow = 0; drawMore(); report();
  });
  await emit('notify-ready');
  // A page that (re)loads starts empty: say so, or a window left at its old size stays on screen, empty.
  report();
})();
