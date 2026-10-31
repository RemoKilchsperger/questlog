// Dorf-Ausbau: Das Dorf baut der Spieler selbst auf. Am Anfang gibt es nur einen
// Strassenhändler – Schmiede, Anschlagtafel und Alchemist muss man bauen und kann
// sie in Stufen ausbauen (0 = nicht gebaut, höchstens 3). Bauen kostet Gold und
// Material, das Monster im jeweiligen Gebiet sicher fallen lassen. Stufe 2
// entspricht jeweils dem früheren festen Dorf, Stufe 3 bringt etwas Neues dazu.
// Siehe docs/dorf-ausbau.md.

import { AREAS, type CreatureDef } from "./creatures";
import type { ShopRules } from "./shop";

/* ───────────── Material ───────────── */

export type MaterialId = "wolfPelt" | "lizardScale" | "crystalShard" | "frostFur" | "boneDust" | "dragonScale";

export interface MaterialDef {
  id: MaterialId;
  name: string;
  icon: string;
  /** Gebiet, dessen Gegner das Material fallen lassen */
  areaId: string;
}

/** Ein Material pro Gebiet – in der Reihenfolge der Gebiete. */
export const MATERIALS: readonly MaterialDef[] = [
  { id: "wolfPelt", name: "Wolfsfell", icon: "🐺", areaId: "darkwood" },
  { id: "lizardScale", name: "Echsenschuppe", icon: "🦎", areaId: "mistmarsh" },
  { id: "crystalShard", name: "Kristallsplitter", icon: "💎", areaId: "crystal-caves" },
  { id: "frostFur", name: "Frostpelz", icon: "❄️", areaId: "frost-peaks" },
  { id: "boneDust", name: "Knochenstaub", icon: "💀", areaId: "shadow-ruins" },
  { id: "dragonScale", name: "Drachenschuppe", icon: "🐉", areaId: "dragon-hoard" },
];

/** Material im Vorrat: Id → Anzahl. Liegt nicht im Inventar und lässt sich nicht verkaufen. */
export type MaterialStock = Partial<Record<MaterialId, number>>;

export function getMaterial(id: MaterialId): MaterialDef {
  const def = MATERIALS.find((m) => m.id === id);
  if (!def) throw new Error(`Unbekanntes Material: ${id}`);
  return def;
}

/**
 * Material für einen Gegner dieses Levels: das des Gebiets, zu dem das Level gehört.
 * So geben Dungeons, Endlos-Turm und Koop-Bosse das Material ihres Level-Bereichs.
 */
export function materialForLevel(level: number): MaterialId {
  const index = AREAS.findIndex((a) => level <= a.maxLevel);
  return MATERIALS[index === -1 ? MATERIALS.length - 1 : Math.min(index, MATERIALS.length - 1)].id;
}

/** Menge pro Sieg: 1 normal, 3 bei Elite-Gegnern, 5 bei Bossen. */
export const MATERIAL_DROP = { normal: 1, elite: 3, boss: 5 };
/** Dungeons geben doppelt so viel Material in die Truhe. */
export const DUNGEON_MATERIAL_FACTOR = 2;

/** Sicheres Material für einen Sieg – ohne Zufall. */
export function creatureMaterials(creature: CreatureDef, elite = false): MaterialStock {
  const count = creature.boss ? MATERIAL_DROP.boss : elite ? MATERIAL_DROP.elite : MATERIAL_DROP.normal;
  return { [materialForLevel(creature.level)]: count };
}

/** Zwei Vorräte zusammenzählen. */
export function addMaterials(stock: MaterialStock, add: MaterialStock | undefined): MaterialStock {
  if (!add) return stock;
  const next = { ...stock };
  for (const [id, count] of Object.entries(add) as [MaterialId, number][]) next[id] = (next[id] ?? 0) + count;
  return next;
}

/** Mengen vervielfachen (Dungeon-Truhe). */
export function scaleMaterials(stock: MaterialStock | undefined, factor: number): MaterialStock {
  return Object.fromEntries(Object.entries(stock ?? {}).map(([id, count]) => [id, count * factor]));
}

/** Materialien mit Menge > 0, in der Reihenfolge der Gebiete. */
export function materialEntries(stock: MaterialStock | undefined): { def: MaterialDef; count: number }[] {
  return MATERIALS.map((def) => ({ def, count: stock?.[def.id] ?? 0 })).filter((e) => e.count > 0);
}

/* ───────────── Gebäude ───────────── */

export type BuildingId = "merchant" | "smith" | "board" | "alchemist";
export type BuildingTier = 0 | 1 | 2 | 3;
export const MAX_BUILDING_TIER = 3;

/** Stufe jedes Gebäudes – wird gespeichert. */
export type Village = Record<BuildingId, BuildingTier>;

/** Neue (und alle bestehenden) Spielstände beginnen mit einem leeren Dorf. */
export const EMPTY_VILLAGE: Village = { merchant: 0, smith: 0, board: 0, alchemist: 0 };

export interface BuildCost {
  gold: number;
  materials: MaterialStock;
}

export interface BuildingTierDef {
  name: string;
  /** Bild der Stufe (Bauplatz → Zelt → Hütte → Haus → Halle) */
  icon: string;
  /** Was die Stufe bringt */
  effect: string;
  /** Kosten, um diese Stufe zu bauen – fehlt bei Stufe 0 */
  cost?: BuildCost;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  description: string;
  /** Stufen 0 bis 3 */
  tiers: readonly [BuildingTierDef, BuildingTierDef, BuildingTierDef, BuildingTierDef];
}

const cost = (gold: number, materials: MaterialStock): BuildCost => ({ gold, materials });

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: "merchant",
    name: "Händler",
    icon: "🛒",
    description: "Verkauft wechselnde Ausrüstung und kauft deine Beute.",
    tiers: [
      { name: "Strassenhändler", icon: "🧺", effect: "4 Stück, nur gewöhnlich und selten (10 %), kein Neuwürfeln" },
      { name: "Krämerladen", icon: "⛺", effect: "6 Stück, 20 % selten, 5 % episch, 2× Neuwürfeln am Tag", cost: cost(300, { wolfPelt: 15 }) },
      {
        name: "Handelshaus",
        icon: "🏠",
        effect: "8 Stück, mit Glück legendär (0,2 %), 5× Neuwürfeln am Tag",
        cost: cost(2000, { crystalShard: 25, wolfPelt: 10 }),
      },
      {
        name: "Grosshandel",
        icon: "🏛️",
        effect: "10 Stück, 8 % episch, 0,5 % legendär, Verkaufspreise +10 %",
        cost: cost(8000, { boneDust: 30, crystalShard: 15 }),
      },
    ],
  },
  {
    id: "smith",
    name: "Schmiede",
    icon: "⚒️",
    description: "Zerlegt Ausrüstung in Essenz und verbessert Waffen und Rüstungen.",
    tiers: [
      { name: "Bauplatz", icon: "🪧", effect: "Noch keine Schmiede: kein Zerlegen, kein Verbessern" },
      { name: "Esse", icon: "🔥", effect: "Zerlegen, Verbessern bis +2", cost: cost(400, { wolfPelt: 20 }) },
      { name: "Schmiede", icon: "🏠", effect: "Verbessern bis +5", cost: cost(2500, { frostFur: 25, lizardScale: 10 }) },
      {
        name: "Meisterschmiede",
        icon: "🏛️",
        effect: "Verbessern kostet 20 % weniger Essenz, beim Zerlegen 75 % statt 50 % zurück",
        cost: cost(10000, { dragonScale: 30, frostFur: 15 }),
      },
    ],
  },
  {
    id: "board",
    name: "Anschlagtafel",
    icon: "📜",
    description: "Bringt zusätzliche Aufträge – das Questbuch gibt es immer.",
    tiers: [
      { name: "Bauplatz", icon: "🪧", effect: "Nur das Questbuch" },
      { name: "Anschlagtafel", icon: "🪵", effect: "3 tägliche Jagdaufträge", cost: cost(150, { wolfPelt: 10 }) },
      {
        name: "Auftragsbrett",
        icon: "🏠",
        effect: "Dazu Händler- und Turm-Aufträge sowie die Wochenaufträge",
        cost: cost(1500, { crystalShard: 25, wolfPelt: 10 }),
      },
      {
        name: "Kopfgeld-Tafel",
        icon: "🏛️",
        effect: "Täglich 2 Steckbriefe für gesuchte Elite-Gegner",
        cost: cost(6000, { boneDust: 30, crystalShard: 15 }),
      },
    ],
  },
  {
    id: "alchemist",
    name: "Alchemist",
    icon: "⚗️",
    description: "Verkauft Tränke – ohne ihn gibt es beim Händler nur kleine Heiltränke.",
    tiers: [
      { name: "Bauplatz", icon: "🪧", effect: "Nur kleine Heiltränke beim Händler" },
      { name: "Kräuterhütte", icon: "🛖", effect: "Dazu Heiltränke", cost: cost(300, { lizardScale: 15 }) },
      {
        name: "Alchemistenlabor",
        icon: "🏠",
        effect: "Angriffs- und Rüstungstränke kaufbar",
        cost: cost(2000, { frostFur: 25, lizardScale: 10 }),
      },
      {
        name: "Meisteralchemist",
        icon: "🏛️",
        effect: "Grosse Heiltränke kaufbar, alle Tränke wirken 25 % stärker",
        cost: cost(8000, { dragonScale: 30, frostFur: 15 }),
      },
    ],
  },
];

export function getBuilding(id: BuildingId): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`Unbekanntes Gebäude: ${id}`);
  return def;
}

/** Kosten der nächsten Stufe – null, wenn das Gebäude schon ganz ausgebaut ist. */
export function nextBuildCost(village: Village, id: BuildingId): BuildCost | null {
  const tier = village[id];
  return tier >= MAX_BUILDING_TIER ? null : getBuilding(id).tiers[tier + 1].cost!;
}

/** Was zur nächsten Stufe noch fehlt (leer: genug von allem). */
export function missingForBuild(cost: BuildCost, gold: number, materials: MaterialStock): { gold: number; materials: MaterialStock } {
  const missing: MaterialStock = {};
  for (const [id, need] of Object.entries(cost.materials) as [MaterialId, number][]) {
    const have = materials[id] ?? 0;
    if (have < need) missing[id] = need - have;
  }
  return { gold: Math.max(0, cost.gold - gold), materials: missing };
}

export function canBuild(village: Village, id: BuildingId, gold: number, materials: MaterialStock): boolean {
  const next = nextBuildCost(village, id);
  if (!next) return false;
  const missing = missingForBuild(next, gold, materials);
  return missing.gold === 0 && Object.keys(missing.materials).length === 0;
}

/** Baut die nächste Stufe – sofort, ohne Wartezeit. */
export function build(
  village: Village,
  id: BuildingId,
  gold: number,
  materials: MaterialStock,
): { village: Village; gold: number; materials: MaterialStock } {
  const next = nextBuildCost(village, id);
  if (!next) throw new Error(`${getBuilding(id).name} ist schon ganz ausgebaut.`);
  const missing = missingForBuild(next, gold, materials);
  if (missing.gold > 0) throw new Error("Nicht genug Gold.");
  if (Object.keys(missing.materials).length > 0) throw new Error("Nicht genug Material.");
  const rest = { ...materials };
  for (const [mid, need] of Object.entries(next.materials) as [MaterialId, number][]) rest[mid] = (rest[mid] ?? 0) - need;
  return {
    village: { ...village, [id]: (village[id] + 1) as BuildingTier },
    gold: gold - next.gold,
    materials: rest,
  };
}

/** Gebäude, die mindestens auf dieser Stufe stehen (für Erfolge). */
export function buildingsAtLeast(village: Village | undefined, tier: number): number {
  return BUILDINGS.filter((b) => (village?.[b.id] ?? 0) >= tier).length;
}

/* ───────────── Wirkung der Stufen ───────────── */

/** Ware, Seltenheiten und Neuwürfeln (shop.ts) – dazu der Verkaufsaufschlag. */
export interface MerchantRules extends ShopRules {
  /** Aufschlag auf den Verkaufspreis (0.1 = +10 %) */
  sellBonus: number;
}

export const MERCHANT_RULES: Readonly<Record<BuildingTier, MerchantRules>> = {
  0: { size: 4, rarityChances: [{ rarity: "rare", chance: 0.1 }], rerollsPerDay: 0, sellBonus: 0 },
  1: {
    size: 6,
    rarityChances: [
      { rarity: "epic", chance: 0.05 },
      { rarity: "rare", chance: 0.2 },
    ],
    rerollsPerDay: 2,
    sellBonus: 0,
  },
  2: {
    size: 8,
    rarityChances: [
      { rarity: "legendary", chance: 0.002 },
      { rarity: "epic", chance: 0.05 },
      { rarity: "rare", chance: 0.2 },
    ],
    rerollsPerDay: 5,
    sellBonus: 0,
  },
  3: {
    size: 10,
    rarityChances: [
      { rarity: "legendary", chance: 0.005 },
      { rarity: "epic", chance: 0.08 },
      { rarity: "rare", chance: 0.2 },
    ],
    rerollsPerDay: 5,
    sellBonus: 0.1,
  },
};

export interface SmithRules {
  /** Zerlegen und Verbessern möglich */
  open: boolean;
  /** Höchste Verbesserungsstufe */
  maxUpgrade: number;
  /** Rabatt auf die Essenz-Kosten einer Verbesserung */
  discount: number;
  /** Anteil der investierten Essenz, den man beim Zerlegen zurückbekommt */
  refund: number;
}

export const SMITH_RULES: Readonly<Record<BuildingTier, SmithRules>> = {
  0: { open: false, maxUpgrade: 0, discount: 0, refund: 0.5 },
  1: { open: true, maxUpgrade: 2, discount: 0, refund: 0.5 },
  2: { open: true, maxUpgrade: 5, discount: 0, refund: 0.5 },
  3: { open: true, maxUpgrade: 5, discount: 0.2, refund: 0.75 },
};

/** Meisteralchemist: alle Tränke wirken so viel stärker. */
export const MASTER_POTION_BONUS = 0.25;

/** Faktor auf die Wirkung aller Tränke im Solo-Kampf (der Koop-Kampf bleibt unberührt). */
export function potionPower(alchemist: BuildingTier): number {
  return alchemist >= 3 ? 1 + MASTER_POTION_BONUS : 1;
}

/** Ab welcher Stufe der Anschlagtafel es die Tages-Jagden, die übrigen Aufträge und die Steckbriefe gibt. */
export const BOARD_TIERS = { hunts: 1, all: 2, bounties: 3 } as const;
