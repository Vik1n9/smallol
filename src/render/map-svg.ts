// The tower map: a schematic of the minimap with each team's 11 towers, 3 inhibitors and nexus.
// Not a picture of the real minimap (no Riot art): lanes are straight lines on a 100x100 board,
// blue base bottom-left, red base top-right, as on the broadcast minimap. Pure: state in, SVG out.

import { LANES, TEAMS, TOWER_SITES, isNexusTurret, type Lane, type MatchState, type Team, type TowerSite } from '../model/types.ts';
import { towerDown } from '../model/clock.ts';

type Pt = readonly [number, number];

/** Blue's buildings. Red's are the mirror image through the centre, with top and bot swapped. */
const BLUE_TOWERS: Record<TowerSite, Pt> = {
  top_outer: [7, 30], top_inner: [7, 50], top_inhib_tower: [7, 67],
  mid_outer: [41, 59], mid_inner: [34, 66], mid_inhib_tower: [26, 74],
  bot_outer: [70, 93], bot_inner: [50, 93], bot_inhib_tower: [33, 93],
  nexus_t1: [11, 81], nexus_t2: [19, 89],
};
const BLUE_INHIBS: Record<Lane, Pt> = { top: [7, 74], mid: [21, 79], bot: [26, 93] };
const BLUE_NEXUS: Pt = [12, 88];

const mirror = ([x, y]: Pt): Pt => [100 - x, 100 - y];
const swapLane = (s: TowerSite): TowerSite => (s.startsWith('top_') ? s.replace('top_', 'bot_') : s.startsWith('bot_') ? s.replace('bot_', 'top_') : s) as TowerSite;
const swapL = (l: Lane): Lane => (l === 'top' ? 'bot' : l === 'bot' ? 'top' : l);

export function towerAt(team: Team, s: TowerSite): Pt {
  return team === 'B' ? BLUE_TOWERS[s] : mirror(BLUE_TOWERS[swapLane(s)]);
}
export function inhibAt(team: Team, l: Lane): Pt {
  return team === 'B' ? BLUE_INHIBS[l] : mirror(BLUE_INHIBS[swapL(l)]);
}
export const nexusAt = (team: Team): Pt => (team === 'B' ? BLUE_NEXUS : mirror(BLUE_NEXUS));

export const TEAM_COLOUR: Record<Team, string> = { B: 'var(--blue)', R: 'var(--red)' };

export interface MapOptions {
  /** Grey out inhibitors that are down (only where the lane can be told). */
  inhibitors: boolean;
  /** Label for "the feed counts more lost towers than were named", e.g. "+1?". */
  unnamed: (n: number) => string;
  unnamedTitle: string;
  unknownTitle: string;
}

const f = (n: number) => +n.toFixed(2);

function square([x, y]: Pt, r: number, team: Team, down: boolean, cls: string): string {
  const fill = down ? 'none' : TEAM_COLOUR[team];
  const stroke = down ? 'var(--muted)' : 'var(--map-edge)';
  return `<rect class="${cls}${down ? ' down' : ''}" x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" rx="${f(r * 0.3)}"
    fill="${fill}" stroke="${stroke}" stroke-width="${down ? 0.7 : 0.6}" ${down ? 'stroke-opacity="0.55" stroke-dasharray="1.2 0.9"' : ''}/>`;
}

export function mapSvg(s: MatchState, clock: number | null, o: MapOptions): string {
  const parts: string[] = [];
  // Board, river and lanes.
  parts.push(`<rect x="0.5" y="0.5" width="99" height="99" rx="8" fill="var(--board)" stroke="var(--border)" stroke-width="0.6"/>`);
  parts.push(`<path d="M18 18 L82 82" stroke="var(--river)" stroke-width="5" stroke-linecap="round" fill="none"/>`);
  parts.push(`<path d="M7 86 L7 7 L86 7 M14 93 L93 93 L93 14 M15 85 L85 15" stroke="var(--lane)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);

  for (const t of TEAMS) {
    const team = s.teams[t];
    const known = s.towersKnown;
    // Inhibitors: a ring per lane; filled while standing.
    const downLanes = new Set(team.inhibitorsDown.map((i) => i.lane).filter((l): l is Lane => l !== null));
    for (const l of LANES) {
      const [x, y] = inhibAt(t, l);
      const down = o.inhibitors && downLanes.has(l);
      parts.push(`<circle class="inhib${down ? ' down' : ''}" cx="${x}" cy="${y}" r="2.3" fill="${down ? 'none' : 'var(--board)'}"
        stroke="${down ? 'var(--muted)' : TEAM_COLOUR[t]}" stroke-width="1.1" ${down ? 'stroke-opacity="0.5" stroke-dasharray="1 0.8"' : ''}/>`);
    }
    const [nx, ny] = nexusAt(t);
    parts.push(`<circle class="nexus" cx="${nx}" cy="${ny}" r="4" fill="${TEAM_COLOUR[t]}" fill-opacity="0.35" stroke="${TEAM_COLOUR[t]}" stroke-width="1"/>`);
    for (const site of TOWER_SITES) {
      const down = known && towerDown(team.towers[site], s, clock);
      const r = isNexusTurret(site) ? 1.9 : 2.4;
      parts.push(square(towerAt(t, site), r, t, down, known ? 'tower' : 'tower unknown'));
    }
    // Lost towers the screen reading has not named yet: a small count in the team's corner.
    if (known && team.unnamedLost > 0) {
      const [x, y, anchor] = t === 'B' ? [3, 97.5, 'start'] : [97, 5.5, 'end'];
      parts.push(`<text class="unnamed" x="${x}" y="${y}" text-anchor="${anchor}" font-size="6"><title>${o.unnamedTitle}</title>${o.unnamed(team.unnamedLost)}</text>`);
    }
  }
  const title = s.towersKnown ? '' : `<title>${o.unknownTitle}</title>`;
  return `<svg class="map${s.towersKnown ? '' : ' unknown'}" viewBox="0 0 100 100" role="img" aria-label="towers">${title}${parts.join('')}</svg>`;
}
