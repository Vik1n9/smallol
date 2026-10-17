// Hover cards for teams and players, from /teams.json (contract v0.7). Plain text for title="":
// card-sized, not a page. The player's bio is the service's own line, built only from facts.

import type { RosterPlayer, RosterTeam } from '../model/roster.ts';
import type { Strings } from '../i18n/index.ts';

/** "Karmine Corp · LEC #3", how it qualified, and its coaches. */
export function teamCard(S: Strings, t: RosterTeam): string {
  const lines = [[t.name, t.seedLabel].filter(Boolean).join(' · ')];
  if (t.qualificationPath) lines.push(t.qualificationPath);
  if (t.coaches.length) lines.push(`${S.ui.coaches}：${t.coaches.map((c) => (c.nationality ? `${c.id}（${c.nationality}）` : c.id)).join('、')}`);
  return lines.join('\n');
}

/** The bio, games this event, and "替補" for a substitute. */
export function playerCard(S: Strings, p: RosterPlayer): string {
  const lines: string[] = [];
  if (p.bio) lines.push(p.bio);
  lines.push(p.gamesThisWorlds ? S.playedThisWorlds(p.gamesThisWorlds) : S.ui.notPlayedYet);
  if (!p.starter) lines.push(S.ui.substitute);
  return lines.join('\n');
}

/** "韓國 26" for tight spots. */
export const playerShort = (S: Strings, p: RosterPlayer) => [p.nationality, p.age === null ? null : S.age(p.age)].filter(Boolean).join(' ');
