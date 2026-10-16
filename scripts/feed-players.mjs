// Dev aid: turn one moment of the official feed into the proposed `players` field
// (docs/CONTRACT_PROPOSAL.md), so the players view can be laid out with real numbers before the
// Stream CV service sends them. Writes raw/players_<gameId>.json; raw/ is git-ignored (recorded
// official data is not committed, CLAUDE.md rule 5). Two GET requests, no key needed.
// Usage: node scripts/feed-players.mjs <gameId> [minutesAfterFirstFrame]

import { mkdirSync, writeFileSync } from 'node:fs';

const [gameId, minutes = '25'] = process.argv.slice(2);
if (!gameId) { console.error('usage: node scripts/feed-players.mjs <gameId> [minutes]'); process.exit(2); }
const FEED = 'https://feed.lolesports.com/livestats/v1';
const get = async (path) => { const r = await fetch(`${FEED}/${path}`); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };

const first = await get(`window/${gameId}`);
const t = new Date(first.frames[0].rfc460Timestamp);
t.setUTCSeconds(0, 0);
t.setUTCMinutes(t.getUTCMinutes() + Number(minutes));
const at = t.toISOString().replace('.000', '');
const [win, det] = await Promise.all([get(`window/${gameId}?startingTime=${at}`), get(`details/${gameId}?startingTime=${at}`)]);
const frame = win.frames.at(-1), detail = det.frames.at(-1);
const byId = new Map(detail.participants.map((p) => [p.participantId, p]));

const players = {};
for (const [side, meta, team] of [['B', 'blueTeamMetadata', 'blueTeam'], ['R', 'redTeamMetadata', 'redTeam']]) {
  players[side] = win.gameMetadata[meta].participantMetadata.map((m) => {
    const live = frame[team].participants.find((p) => p.participantId === m.participantId);
    return {
      role: m.role, name: m.summonerName, champion: m.championId,
      level: live.level, kills: live.kills, deaths: live.deaths, assists: live.assists,
      cs: live.creepScore, gold: live.totalGold, hp: live.currentHealth, maxHp: live.maxHealth,
      items: byId.get(m.participantId)?.items ?? [],
    };
  });
}
mkdirSync('raw', { recursive: true });
const out = `raw/players_${gameId}.json`;
writeFileSync(out, `${JSON.stringify({ _from: `feed window+details at ${frame.rfc460Timestamp}`, players }, null, 1)}\n`);
console.log(`${out}: feed time ${frame.rfc460Timestamp}, game state ${frame.gameState}`);
