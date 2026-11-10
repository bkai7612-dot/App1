/** P-04: common nicknames players type, mapped to game slugs (first = most likely). */
export const GAME_ALIASES: Record<string, string[]> = {
  cod: ["call-of-duty-black-ops-6", "call-of-duty-warzone", "call-of-duty-modern-warfare-iii", "call-of-duty-mobile"],
  "call of duty": ["call-of-duty-black-ops-6", "call-of-duty-warzone", "call-of-duty-modern-warfare-iii", "call-of-duty-mobile"],
  bo6: ["call-of-duty-black-ops-6"], "black ops": ["call-of-duty-black-ops-6"], mw3: ["call-of-duty-modern-warfare-iii"], wz: ["call-of-duty-warzone"], warzone: ["call-of-duty-warzone"], codm: ["call-of-duty-mobile"],
  fifa: ["ea-sports-fc-26", "ea-sports-fc-25"], fc: ["ea-sports-fc-26", "ea-sports-fc-25"], fc25: ["ea-sports-fc-25"], fc26: ["ea-sports-fc-26"], fut: ["ea-sports-fc-26", "ea-sports-fc-25"],
  cs: ["counter-strike-2"], cs2: ["counter-strike-2"], csgo: ["counter-strike-2"], "cs:go": ["counter-strike-2"],
  lol: ["league-of-legends"], league: ["league-of-legends"], tft: ["teamfight-tactics"], lor: ["legends-of-runeterra"],
  r6: ["rainbow-six-siege"], siege: ["rainbow-six-siege"], "rainbow six": ["rainbow-six-siege"],
  ow: ["overwatch-2", "overwatch"], ow2: ["overwatch-2"], apex: ["apex-legends"], pubg: ["pubg-battlegrounds", "pubg-mobile"],
  gta: ["grand-theft-auto-online"], "gta online": ["grand-theft-auto-online"], gtao: ["grand-theft-auto-online"], rdo: ["red-dead-online"], rdr2: ["red-dead-online"],
  wow: ["world-of-warcraft", "world-of-warcraft-classic"], ffxiv: ["final-fantasy-xiv"], ff14: ["final-fantasy-xiv"], eso: ["the-elder-scrolls-online"], swtor: ["star-wars-the-old-republic"],
  osrs: ["old-school-runescape"], rs: ["runescape", "old-school-runescape"], rs3: ["runescape"], poe: ["path-of-exile-2"], poe2: ["path-of-exile-2"],
  dbd: ["dead-by-daylight"], tarkov: ["escape-from-tarkov"], eft: ["escape-from-tarkov"], drg: ["deep-rock-galactic"], l4d2: ["left-4-dead-2"], tf2: ["team-fortress-2"],
  hd2: ["helldivers-2"], sot: ["sea-of-thieves"], rl: ["rocket-league"], mk1: ["mortal-kombat-1"], sf6: ["street-fighter-6"], smash: ["super-smash-bros-ultimate"], ssbu: ["super-smash-bros-ultimate"],
  mlbb: ["mobile-legends-bang-bang"], hok: ["honor-of-kings"], aoe2: ["age-of-empires-ii-definitive-edition"], aoe4: ["age-of-empires-iv"], sc2: ["starcraft-ii"], civ6: ["civilization-vi"], civ7: ["civilization-vii"],
  bf2042: ["battlefield-2042"], bfv: ["battlefield-v"], bf: ["battlefield-2042", "battlefield-v"], mc: ["minecraft"], mhw: ["monster-hunter-wilds"], botw: [], ttv: [],
  "2k": ["nba-2k25"], nba: ["nba-2k25"], madden: ["madden-nfl-25"], gt7: ["gran-turismo-7"], fh5: ["forza-horizon-5"], mk8: ["mario-kart-8-deluxe"], acnh: ["animal-crossing-new-horizons"],
  "space marine": ["warhammer-40000-space-marine-2"], sm2: ["warhammer-40000-space-marine-2"], division: ["tom-clancys-the-division-2"], "division 2": ["tom-clancys-the-division-2"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Suggestions for typed text that isn't an exact game name: aliases first, then close spellings, then word matches. */
export function suggestGames<G extends { slug: string; name: string }>(text: string, games: G[], max = 4): G[] {
  const t = norm(text);
  if (t.length < 2) return [];
  const bySlug = new Map(games.map((g) => [g.slug, g]));
  const out: G[] = [];
  const add = (g?: G) => { if (g && !out.includes(g) && out.length < max) out.push(g); };
  for (const s of GAME_ALIASES[t] ?? GAME_ALIASES[t.replace(/ /g, "")] ?? []) add(bySlug.get(s));
  const scored = games.map((g) => ({ g, n: norm(g.name) }))
    .map(({ g, n }) => ({ g, score: n.startsWith(t) ? 0 : n.split(" ").some((w) => w.startsWith(t)) ? 1 : n.includes(t) ? 2 : lev(t, n) <= Math.max(1, Math.floor(t.length / 4)) ? 3 : 9 }))
    .filter((x) => x.score < 9).sort((a, b) => a.score - b.score || a.g.name.localeCompare(b.g.name));
  for (const x of scored) add(x.g);
  return out;
}
