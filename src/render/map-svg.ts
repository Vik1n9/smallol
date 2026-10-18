// The tower map in 2.5D, after Basesmall's board: the ground is squashed and every building is a
// piece with a side, a top and a soft shadow. Standing towers are tall pillars in the team colour,
// fallen ones grey stumps; inhibitors are crystals, the nexus a two-tier block. Respawn countdowns
// sit on the building that will come back. Not a picture of the real minimap (no Riot art): lanes
// are straight lines on a 100x100 ground, blue base bottom-left, red top-right, as on the broadcast.
// Pure: state in, SVG out.

import { LANES, TEAMS, TOWER_SITES, isNexusTurret, type Lane, type MatchState, type Team, type TowerSite } from '../model/types.ts';
import { fmtClock, left, timersOn, towerDown } from '../model/clock.ts';
import { shade } from './colour.ts';
import { ELEMENT_COLOUR } from './dragons.ts';

type Pt = readonly [number, number];

/** Blue's buildings on the 100x100 ground. Red's are the mirror image, with top and bot swapped. */
const BLUE_TOWERS: Record<TowerSite, Pt> = {
  top_outer: [7, 28], top_inner: [7, 48], top_inhib_tower: [7, 66],
  mid_outer: [42, 58], mid_inner: [35, 65], mid_inhib_tower: [27, 73],
  bot_outer: [72, 93], bot_inner: [52, 93], bot_inhib_tower: [34, 93],
  nexus_t1: [10, 80], nexus_t2: [20, 90],
};
const BLUE_INHIBS: Record<Lane, Pt> = { top: [7, 74], mid: [21, 79], bot: [26, 93] };
const BLUE_NEXUS: Pt = [12, 88];

const mirror = ([x, y]: Pt): Pt => [100 - x, 100 - y];
const swapSite = (s: TowerSite): TowerSite => (s.startsWith('top_') ? s.replace('top_', 'bot_') : s.startsWith('bot_') ? s.replace('bot_', 'top_') : s) as TowerSite;
const swapLane = (l: Lane): Lane => (l === 'top' ? 'bot' : l === 'bot' ? 'top' : l);

export function towerAt(team: Team, s: TowerSite): Pt {
  return team === 'B' ? BLUE_TOWERS[s] : mirror(BLUE_TOWERS[swapSite(s)]);
}
export function inhibAt(team: Team, l: Lane): Pt {
  return team === 'B' ? BLUE_INHIBS[l] : mirror(BLUE_INHIBS[swapLane(l)]);
}
export const nexusAt = (team: Team): Pt => (team === 'B' ? BLUE_NEXUS : mirror(BLUE_NEXUS));

/** Team colours as hex, so sides can be shaded. The CSS uses the same values (--blue, --red). */
export const TEAM_HEX: Record<Team, string> = { B: '#4C93E6', R: '#E0574C' };
export const TEAM_COLOUR: Record<Team, string> = { B: 'var(--blue)', R: 'var(--red)' };

// ---------- projection ----------

/** Ground squash (Basesmall uses 0.5 for its field; a map wants a little more depth). */
const K = 0.64;
/** Room above the far edge for the tallest pieces. */
const TOP = 8;
/** Ellipse ratio of a round top seen from the camera. */
const ER = 0.5;
const SLAB = 3.2;
export const VIEW_W = 102, VIEW_H = TOP + 100 * K + SLAB + 3;

const P = ([x, y]: Pt): Pt => [x, TOP + y * K];
const n = (v: number) => +v.toFixed(2);

// ---------- pieces ----------

interface Piece { y: number; svg: string }

function cylinder(x: number, y: number, r: number, h: number, top: string, side: string, extra = ''): string {
  const ry = r * ER;
  return `<path d="M${n(x - r)} ${n(y - h)} L${n(x - r)} ${n(y)} A${n(r)} ${n(ry)} 0 0 0 ${n(x + r)} ${n(y)} L${n(x + r)} ${n(y - h)} Z" fill="${side}" ${extra}/>`
    + `<ellipse cx="${n(x)}" cy="${n(y - h)}" rx="${n(r)}" ry="${n(ry)}" fill="${top}" ${extra}/>`;
}

const shadow = (x: number, y: number, r: number) =>
  `<ellipse cx="${n(x + 0.5)}" cy="${n(y + 0.6)}" rx="${n(r * 1.15)}" ry="${n(r * ER * 1.1)}" fill="rgba(0,0,0,.45)"/>`;
const gloss = (x: number, y: number, r: number) =>
  `<ellipse cx="${n(x - r * 0.25)}" cy="${n(y - r * ER * 0.25)}" rx="${n(r * 0.5)}" ry="${n(r * ER * 0.45)}" fill="#fff" fill-opacity=".22"/>`;

const RIM = 'stroke="rgba(10,12,16,.65)" stroke-width="0.35"';
const STUMP_RIM = 'stroke="#6B7280" stroke-opacity=".7" stroke-width="0.4" stroke-dasharray="0.9 0.7"';

function tower(at: Pt, team: Team, kind: 'tower' | 'nexusTurret', state: 'up' | 'down' | 'unknown'): Piece {
  const [x, y] = P(at);
  const r = kind === 'tower' ? 2.5 : 1.9;
  if (state === 'down') {
    return { y, svg: `<g class="tower down">${shadow(x, y, r * 0.9)}${cylinder(x, y, r, 0.8, '#2C3038', '#1C1F25', STUMP_RIM)}</g>` };
  }
  const h = kind === 'tower' ? 5.2 : 3.8;
  const col = state === 'unknown' ? '#7A808C' : TEAM_HEX[team];
  const fade = state === 'unknown' ? ' opacity=".45"' : '';
  return { y, svg: `<g class="tower${state === 'unknown' ? ' unknown' : ''}"${fade}>${shadow(x, y, r)}${cylinder(x, y, r, h, col, shade(col, 0.55), RIM)}${gloss(x, y - h, r)}</g>` };
}

function crystal(at: Pt, team: Team, down: boolean): Piece {
  const [x, y] = P(at);
  const r = 2.4, ry = r * ER;
  if (down) {
    return { y, svg: `<g class="inhib down"><path d="M${n(x - r)} ${n(y)} L${n(x)} ${n(y - ry)} L${n(x + r)} ${n(y)} L${n(x)} ${n(y + ry)} Z" fill="#1C1F25" ${STUMP_RIM}/></g>` };
  }
  const h = 2.6, c = shade(TEAM_HEX[team], 1.25);
  const top = `M${n(x - r)} ${n(y - h)} L${n(x)} ${n(y - h - ry)} L${n(x + r)} ${n(y - h)} L${n(x)} ${n(y - h + ry)} Z`;
  const leftFace = `M${n(x - r)} ${n(y - h)} L${n(x)} ${n(y - h + ry)} L${n(x)} ${n(y + ry)} L${n(x - r)} ${n(y)} Z`;
  const rightFace = `M${n(x)} ${n(y - h + ry)} L${n(x + r)} ${n(y - h)} L${n(x + r)} ${n(y)} L${n(x)} ${n(y + ry)} Z`;
  return { y, svg: `<g class="inhib">${shadow(x, y, r)}<path d="${leftFace}" fill="${shade(c, 0.7)}" ${RIM}/><path d="${rightFace}" fill="${shade(c, 0.5)}" ${RIM}/><path d="${top}" fill="${c}" ${RIM}/></g>` };
}

function nexus(at: Pt, team: Team): Piece {
  const [x, y] = P(at);
  const c = TEAM_HEX[team];
  return {
    y, svg: `<g class="nexus">${shadow(x, y, 4.6)}${cylinder(x, y, 4.6, 2.2, shade(c, 0.85), shade(c, 0.45), RIM)}${cylinder(x, y - 2.2, 2.7, 2.6, c, shade(c, 0.55), RIM)}${gloss(x, y - 4.8, 2.7)}</g>`,
  };
}

/** A countdown tag above a building. */
function tag(at: Pt, lift: number, text: string, team: Team): Piece {
  const [x, y0] = P(at);
  const y = y0 - lift;
  const w = text.length * 2.45 + 2.6;
  return {
    y: 1000 + y,
    svg: `<g class="tag"><rect x="${n(x - w / 2)}" y="${n(y - 4.6)}" width="${n(w)}" height="5.2" rx="2.6" fill="var(--panel)" stroke="${TEAM_COLOUR[team]}" stroke-width="0.4"/>`
      + `<text x="${n(x)}" y="${n(y - 0.95)}" text-anchor="middle" font-size="3.9">${text}</text></g>`,
  };
}

// ---------- the map ----------

export interface MapOptions {
  /** Grey out inhibitors that are down (only where the lane can be told). */
  inhibitors: boolean;
  /** Countdown tags on inhibitors and the nexus (settings: inhibitors, nexusTimers). */
  inhibTimers: boolean;
  nexusTimers: boolean;
  /** Label for "the feed counts more lost towers than were named", e.g. "+1?". */
  unnamed: (n: number) => string;
  unnamedTitle: string;
  unknownTitle: string;
  /** The drakes each team took, as small coins along its edge of the board (minimap window). */
  drakes?: { titles: (e: string) => string };
}

/**
 * A team's drakes as coins in the map's own 2.5D style, smaller than a tower, off the board so they never
 * sit among the towers: blue's on the ledge in front of the board, red's behind its far edge, in the order
 * taken; elders after them. With the soul, a gold rim.
 */
function drakeCoins(s: MatchState, o: NonNullable<MapOptions['drakes']>): Piece[] {
  const out: Piece[] = [];
  for (const t of TEAMS) {
    const team = s.teams[t];
    const coins: string[] = [...team.dragons, ...Array<string>(team.elders ?? 0).fill('elder')];
    const soul = s.soul?.team === t;
    coins.forEach((e, i) => {
      const [x, y] = P(t === 'B' ? [40 + i * 5, 104.2] : [60 - i * 5, -4.6]);
      const c = ELEMENT_COLOUR[e as keyof typeof ELEMENT_COLOUR] ?? '#999';
      const rim = soul && e !== 'elder' ? 'stroke="#E8B04A" stroke-width="0.55"' : RIM;
      out.push({ y: t === 'B' ? y + 200 : y - 200, svg: `<g class="drake"><title>${o.titles(e)}</title>${shadow(x, y, 1.8)}${cylinder(x, y, 1.8, 1.2, c, shade(c, 0.55), rim)}${gloss(x, y - 1.2, 1.8)}</g>` });
    });
  }
  return out;
}

function ground(): string {
  const corner = (pts: Pt[]) => pts.map((p) => P(p).map(n).join(',')).join(' ');
  const [, y0] = P([0, 0]), [, y1] = P([0, 100]);
  const lanes = [[[7, 86], [7, 7], [86, 7]], [[14, 93], [93, 93], [93, 14]], [[16, 84], [84, 16]]] as Pt[][];
  const base = (t: Team) => { const [x, y] = P(nexusAt(t)); return `<ellipse cx="${x}" cy="${n(y)}" rx="17" ry="${n(17 * K)}" fill="${TEAM_HEX[t]}" fill-opacity=".09"/>`; };
  const board = `x="0.5" y="${n(y0)}" width="101" height="${n(y1 - y0 + 0.5)}" rx="6" ry="${n(6 * K)}"`;
  // The base tints stay on the board.
  return `<defs><clipPath id="lolmap-board"><rect ${board}/></clipPath></defs>`
    + `<rect x="0.5" y="${n(y1)}" width="101" height="${SLAB + 0.5}" rx="2" fill="#121418"/>`
    + `<rect ${board} fill="var(--board)" stroke="var(--border)" stroke-width="0.5"/>`
    + `<g clip-path="url(#lolmap-board)"><polyline points="${corner([[16, 16], [84, 84]])}" fill="none" stroke="var(--river)" stroke-width="6" stroke-linecap="round"/>`
    + `${base('B')}${base('R')}</g>`
    + lanes.map((l) => `<polyline points="${corner(l)}" fill="none" stroke="var(--lane)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}

export function mapSvg(s: MatchState, clock: number | null, o: MapOptions): string {
  const pieces: Piece[] = [];
  const timing = timersOn(s);
  for (const t of TEAMS) {
    const team = s.teams[t];
    const known = s.towersKnown;
    const downLanes = new Map<Lane, number>();
    for (const i of team.inhibitorsDown) if (i.lane && (!timing || left(i.respawnAt, clock) !== null)) downLanes.set(i.lane, i.respawnAt);
    for (const l of LANES) {
      const down = o.inhibitors && downLanes.has(l);
      pieces.push(crystal(inhibAt(t, l), t, down));
      const at = downLanes.get(l);
      const rest = at !== undefined && timing && o.inhibTimers ? left(at, clock) : null;
      if (down && rest !== null) pieces.push(tag(inhibAt(t, l), 2.4, fmtClock(rest), t));
    }
    pieces.push(nexus(nexusAt(t), t));
    const nexusBack: number[] = [];
    for (const site of TOWER_SITES) {
      const tw = team.towers[site];
      const down = known && towerDown(tw, s, clock);
      pieces.push(tower(towerAt(t, site), t, isNexusTurret(site) ? 'nexusTurret' : 'tower', !known ? 'unknown' : down ? 'down' : 'up'));
      if (down && isNexusTurret(site) && tw.respawnAt !== null) nexusBack.push(tw.respawnAt);
    }
    // Both nexus turrets usually fall together: one tag on the nexus, for the first to come back.
    const soonest = nexusBack.length ? Math.min(...nexusBack) : null;
    const rest = soonest !== null && timing && o.nexusTimers ? left(soonest, clock) : null;
    if (rest !== null) pieces.push(tag(nexusAt(t), 8.4, fmtClock(rest), t));
  }
  if (o.drakes) pieces.push(...drakeCoins(s, o.drakes));
  pieces.sort((a, b) => a.y - b.y);

  const notes: string[] = [];
  for (const t of TEAMS) {
    const u = s.teams[t].unnamedLost;
    if (!s.towersKnown || u <= 0) continue;
    const [x, y, anchor] = t === 'B' ? [3, VIEW_H - 1.5, 'start'] : [99, 5, 'end'];
    notes.push(`<text class="unnamed" x="${x}" y="${n(y)}" text-anchor="${anchor}" font-size="4.6"><title>${o.unnamedTitle}</title>${o.unnamed(u)}</text>`);
  }
  const title = s.towersKnown ? '' : `<title>${o.unknownTitle}</title>`;
  return `<svg class="map${s.towersKnown ? '' : ' unknown'}" viewBox="-0.5 0 ${VIEW_W} ${n(VIEW_H)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="towers">${title}`
    + `${ground()}${pieces.map((p) => p.svg).join('')}${notes.join('')}</svg>`;
}
