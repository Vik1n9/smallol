// Champion names (text only: no portraits, no art) from Riot's Data Dragon, zh_TW and en_US.
// Writes src/data/champions.json. Run again when a new champion comes out.
// Usage: node scripts/champion-names.mjs [version]

import { writeFileSync } from 'node:fs';

const DD = 'https://ddragon.leagueoflegends.com';
const version = process.argv[2] ?? (await (await fetch(`${DD}/api/versions.json`)).json())[0];
const load = async (locale) => (await (await fetch(`${DD}/cdn/${version}/data/${locale}/champion.json`)).json()).data;
const [zh, en] = await Promise.all([load('zh_TW'), load('en_US')]);

const names = {};
for (const id of Object.keys(en).sort()) names[id] = { 'zh-Hant': zh[id]?.name ?? en[id].name, en: en[id].name, key: en[id].key };
writeFileSync('src/data/champions.json', `${JSON.stringify({ source: `Data Dragon ${version}`, names }, null, 1)}\n`);
console.log(`src/data/champions.json: ${Object.keys(names).length} champions, Data Dragon ${version}`);
