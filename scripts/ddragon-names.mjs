// Champion and item names (text only: no portraits, no icons, no art) from Riot's Data Dragon,
// zh_TW and en_US. Writes src/data/champions.json and src/data/items.json. Run again on a new patch.
// Usage: node scripts/ddragon-names.mjs [version]

import { writeFileSync } from 'node:fs';

const DD = 'https://ddragon.leagueoflegends.com';
const version = process.argv[2] ?? (await (await fetch(`${DD}/api/versions.json`)).json())[0];
const load = async (kind, locale) => (await (await fetch(`${DD}/cdn/${version}/data/${locale}/${kind}.json`)).json()).data;
const source = `Data Dragon ${version}`;

const [zh, en] = await Promise.all([load('champion', 'zh_TW'), load('champion', 'en_US')]);
const champions = {};
for (const id of Object.keys(en).sort()) champions[id] = { 'zh-Hant': zh[id]?.name ?? en[id].name, en: en[id].name, key: en[id].key };
writeFileSync('src/data/champions.json', `${JSON.stringify({ source, names: champions }, null, 1)}\n`);
console.log(`src/data/champions.json: ${Object.keys(champions).length} champions, ${source}`);

// Items on Summoner's Rift (map 11) only: other modes' items would only make the table bigger.
const [izh, ien] = await Promise.all([load('item', 'zh_TW'), load('item', 'en_US')]);
const items = {};
// A few names carry markup (Gangplank's upgrades: "<rarityLegendary>…</rarityLegendary><br>…"): keep the first line's text.
const plain = (s) => s.split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, '').trim();
for (const id of Object.keys(ien).sort((a, b) => Number(a) - Number(b))) {
  if (!ien[id].maps?.['11']) continue;
  items[id] = { 'zh-Hant': plain(izh[id]?.name ?? ien[id].name), en: plain(ien[id].name) };
  // Trinkets, wards and potions: the players view leaves them out of the item line.
  if (ien[id].tags?.some((t) => t === 'Trinket' || t === 'Consumable')) items[id].minor = true;
  // A finished legendary: bought, built from parts, builds into nothing, 2200 gold or more (the
  // "first legendary" event and the players panel count; no hand-kept list, docs/UI_SPEC_v1.md §3).
  const it = ien[id];
  if (it.gold?.purchasable && it.from?.length && !it.into?.length && it.gold.total >= 2200 && !items[id].minor) items[id].legendary = true;
}
writeFileSync('src/data/items.json', `${JSON.stringify({ source, names: items }, null, 1)}\n`);
console.log(`src/data/items.json: ${Object.keys(items).length} items, ${source}`);
