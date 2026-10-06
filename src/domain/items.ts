import { MAX_LEVEL } from "./leveling";
import type {
  ArmorSlot,
  EquipSlot,
  ItemDef,
  ItemStats,
  ItemType,
  OwnedItem,
  Rarity,
  StatKey,
  Stats,
} from "./types";

export const ARMOR_SLOTS: readonly ArmorSlot[] = ["head", "chest", "arms", "legs", "feet"];
export const WEAPON_SLOTS = ["weapon1", "weapon2"] as const;

export const SLOT_LABELS: Record<EquipSlot, string> = {
  head: "Helm",
  chest: "Brust",
  arms: "Armschutz",
  legs: "Beine",
  feet: "Schuhe",
  weapon1: "Waffe 1",
  weapon2: "Waffe 2",
};

export const SLOT_ICONS: Record<EquipSlot, string> = {
  head: "🪖",
  chest: "🥋",
  arms: "🧤",
  legs: "👖",
  feet: "🥾",
  weapon1: "🗡️",
  weapon2: "🛡️",
};

/** Anzahl verschiedener Items pro Typ, verteilt über Level 1 bis MAX_LEVEL. */
export const ITEMS_PER_TYPE = 200;

export interface ItemTypeInfo {
  type: ItemType;
  kind: "armor" | "weapon";
  label: string;
  icon: string;
  /** Wortendungen für die Namen, z. B. "Eisen" + "helm". Werden reihum verwendet. */
  nouns: readonly string[];
  /** Rüstung bzw. Angriff auf Level 1 – wächst mit dem Level. */
  baseArmor: number;
  baseAttack: number;
  twoHanded: boolean;
}

const armor = (type: ArmorSlot, label: string, icon: string, nouns: string[], baseArmor: number): ItemTypeInfo => ({
  type, kind: "armor", label, icon, nouns, baseArmor, baseAttack: 0, twoHanded: false,
});

const weapon = (
  type: ItemType,
  label: string,
  icon: string,
  nouns: string[],
  baseAttack: number,
  twoHanded = false,
): ItemTypeInfo => ({ type, kind: "weapon", label, icon, nouns, baseArmor: 0, baseAttack, twoHanded });

/**
 * Alle Item-Typen. Zweihandwaffen sind etwa doppelt so stark wie
 * Einhandwaffen, belegen dafür aber beide Hände.
 */
export const ITEM_TYPES: readonly ItemTypeInfo[] = [
  armor("head", "Helm", "🪖", ["helm", "haube"], 2),
  armor("chest", "Brust", "🥋", ["harnisch", "panzer", "brünne"], 4),
  armor("arms", "Armschutz", "🧤", ["armschienen", "handschuhe", "stulpen"], 1.5),
  armor("legs", "Beine", "👖", ["beinschienen", "beinlinge"], 3),
  armor("feet", "Schuhe", "🥾", ["stiefel", "schuhe"], 1.5),
  weapon("dagger", "Dolch", "🔪", ["dolch", "stilett"], 2.5),
  weapon("sword", "Schwert", "🗡️", ["schwert", "klinge", "säbel"], 3),
  weapon("greatsword", "Zweihandschwert", "⚔️", ["zweihänder", "bihänder"], 6.5, true),
  { ...weapon("shield", "Schild", "🛡️", ["schild", "rundschild", "turmschild"], 0), baseArmor: 3 },
  weapon("axe", "Axt", "🪓", ["axt", "beil"], 3.2),
  weapon("greataxe", "Grossaxt", "🪓", ["grossaxt", "doppelaxt"], 6.8, true),
  weapon("staff", "Stab", "🪄", ["stab"], 6, true),
  weapon("scepter", "Zepter", "🔱", ["zepter"], 2.8),
  weapon("mace", "Streitkolben", "⚒️", ["streitkolben", "morgenstern", "keule"], 3.1),
  weapon("greathammer", "Grosshammer", "🔨", ["grosshammer", "kriegshammer"], 7.2, true),
  weapon("bow", "Bogen", "🏹", ["bogen", "langbogen", "kurzbogen"], 6.4, true),
];

/** 20 Materialstufen für den Namensanfang – je eine pro 3 Level. */
const NAME_PREFIXES = [
  "Rost", "Kupfer", "Bronze", "Eisen", "Wolfs", "Stahl", "Silber", "Runen", "Schatten", "Mondsilber",
  "Sturm", "Glut", "Frost", "Mithril", "Obsidian", "Adamant", "Drachen", "Sternen", "Phönix", "Götter",
] as const;

/** 10 Beinamen – zusammen mit den Materialstufen ergibt das 200 Namen pro Typ. */
const NAME_SUFFIXES = [
  "des Wanderers", "der Wacht", "des Nordens", "der Ahnen", "der Dämmerung",
  "des Bären", "der Stille", "des Zorns", "der Tiefe", "der Könige",
] as const;

/** Level-Anforderung des n-ten Items eines Typs (0 → Lv. 1, 199 → Lv. 60). */
export function levelForIndex(index: number): number {
  return 1 + Math.floor((index * MAX_LEVEL) / ITEMS_PER_TYPE);
}

/** Erstes Item eines Typs mit genau diesem Level. */
export function indexForLevel(level: number): number {
  return Math.ceil(((level - 1) * ITEMS_PER_TYPE) / MAX_LEVEL);
}

/** Werte wachsen linear mit dem Level: Lv. 60 ist etwa 16× so stark wie Lv. 1. */
const levelScale = (level: number) => 1 + (level - 1) * 0.25;

/** Kleine, feste Streuung (±10 %), damit sich Items gleichen Levels unterscheiden. */
const variance = (index: number) => 0.9 + ((index * 37) % 21) / 100;

/** Bestandteile eines Items: Material (0–19), Namensform (Index in `nouns`) und Beiname (0–9). */
export interface ItemParts {
  material: number;
  noun: number;
  suffix: number;
}

function partsForIndex(info: ItemTypeInfo, index: number): ItemParts {
  return {
    material: Math.floor(index / NAME_SUFFIXES.length),
    noun: index % info.nouns.length,
    suffix: index % NAME_SUFFIXES.length,
  };
}

/** Woraus ein Item besteht – Grundlage für seine Grafik (z. B. Kupfer- vs. Eisenbeinschienen). */
export function getItemParts(def: ItemDef): ItemParts {
  if (def.bossId) throw new Error(`${def.name} ist ein Boss-Item und hat kein Material.`);
  const index = Number(def.id.slice(def.type.length + 1));
  return partsForIndex(getItemType(def.type), index);
}

function buildItem(info: ItemTypeInfo, index: number): ItemDef {
  const requiredLevel = levelForIndex(index);
  const factor = levelScale(requiredLevel) * variance(index);
  const scaled = (base: number) => (base > 0 ? Math.max(1, Math.round(base * factor)) : 0);
  const armorValue = scaled(info.baseArmor);
  const attack = scaled(info.baseAttack);
  const parts = partsForIndex(info, index);
  return {
    id: `${info.type}-${index}`,
    kind: info.kind,
    type: info.type,
    name: `${NAME_PREFIXES[parts.material]}${info.nouns[parts.noun]} ${NAME_SUFFIXES[parts.suffix]}`,
    icon: info.icon,
    armor: armorValue,
    attack,
    twoHanded: info.twoHanded,
    price: Math.max(3, Math.round((armorValue + attack) * 4 * (1 + requiredLevel / 10))),
    requiredLevel,
  };
}

/** Gesamter Katalog: 16 Typen × 200 Items, sortiert nach Level. */
export const ITEMS: readonly ItemDef[] = ITEM_TYPES.flatMap((info) =>
  Array.from({ length: ITEMS_PER_TYPE }, (_, i) => buildItem(info, i)),
).sort((a, b) => a.requiredLevel - b.requiredLevel);

interface BossItemSpec {
  bossId: string;
  /** Level des Bosses = benötigtes Level */
  level: number;
  type: ItemType;
  name: string;
  /** Dungeon-Beute (stärker als die der Gebietsbosse) */
  dungeon?: boolean;
  /** Raid-Beute der Koop-Bosse (noch etwas stärker als Dungeon-Beute) */
  raid?: boolean;
}

/**
 * Pro Gebietsboss drei Waffen, ein Helm und eine Brustrüstung – passend zum Boss.
 * Über alle Bosse (inkl. Dungeons) hat jeder Waffentyp zwei bis drei Boss-Waffen.
 */
const BOSS_ITEM_SPECS: readonly BossItemSpec[] = [
  { bossId: "goblin-chief", level: 10, type: "axe", name: "Krummzahns Hackbeil" },
  { bossId: "goblin-chief", level: 10, type: "mace", name: "Häuptlingskeule" },
  { bossId: "goblin-chief", level: 10, type: "bow", name: "Krummzahns Knochenbogen" },
  { bossId: "goblin-chief", level: 10, type: "head", name: "Knochenkrone des Krummzahn" },
  { bossId: "goblin-chief", level: 10, type: "chest", name: "Fellharnisch des Häuptlings" },
  { bossId: "ancient-lizard", level: 20, type: "sword", name: "Echsenzahn" },
  { bossId: "ancient-lizard", level: 20, type: "greataxe", name: "Schuppenspalter" },
  { bossId: "ancient-lizard", level: 20, type: "dagger", name: "Giftzahn der Uralten" },
  { bossId: "ancient-lizard", level: 20, type: "head", name: "Schädel der Uralten Echse" },
  { bossId: "ancient-lizard", level: 20, type: "chest", name: "Schuppenpanzer der Uralten" },
  { bossId: "cave-eye", level: 30, type: "staff", name: "Blick des Höhlenauges" },
  { bossId: "cave-eye", level: 30, type: "sword", name: "Prismaklinge" },
  { bossId: "cave-eye", level: 30, type: "shield", name: "Spiegel des Höhlenauges" },
  { bossId: "cave-eye", level: 30, type: "head", name: "Krone des Allsehenden" },
  { bossId: "cave-eye", level: 30, type: "chest", name: "Kristallharnisch der Tiefe" },
  { bossId: "primal-mammoth", level: 40, type: "greatsword", name: "Stosszahn von Graufrost" },
  { bossId: "primal-mammoth", level: 40, type: "greathammer", name: "Gletscherhammer" },
  { bossId: "primal-mammoth", level: 40, type: "bow", name: "Elfenbeinbogen von Graufrost" },
  { bossId: "primal-mammoth", level: 40, type: "head", name: "Mammuthaupt" },
  { bossId: "primal-mammoth", level: 40, type: "chest", name: "Graufrostpelz" },
  { bossId: "lich-king", level: 50, type: "sword", name: "Seelenklinge des Lichkönigs" },
  { bossId: "lich-king", level: 50, type: "scepter", name: "Zepter der Verdammnis" },
  { bossId: "lich-king", level: 50, type: "greathammer", name: "Grabhammer des Lichkönigs" },
  { bossId: "lich-king", level: 50, type: "head", name: "Krone des Lichkönigs" },
  { bossId: "lich-king", level: 50, type: "chest", name: "Gewand des Totenkönigs" },
  { bossId: "ignaroth", level: 60, type: "greatsword", name: "Flammenzunge Ignaroths" },
  { bossId: "ignaroth", level: 60, type: "greataxe", name: "Ignaroths Klaue" },
  { bossId: "ignaroth", level: 60, type: "mace", name: "Glutstern Ignaroths" },
  { bossId: "ignaroth", level: 60, type: "head", name: "Drachenkopfhelm" },
  { bossId: "ignaroth", level: 60, type: "chest", name: "Schuppenpanzer Ignaroths" },

  // Dungeon-Bosse: je 2 Waffen und ein komplettes Rüstungsset. Die Waffen decken die Typen ab,
  // die bei den Gebietsbossen fehlen (Dolch, Schild) oder selten sind (Zepter, Streitkolben, Axt, Stab).
  ...dungeonSet("ore-king", 12, [
    ["dagger", "Grimmbarts Grubendolch"],
    ["shield", "Erzschild der Tiefe"],
    ["head", "Grubenhelm mit Laterne"],
    ["chest", "Harnisch des Erzgräbers"],
    ["arms", "Handschuhe des Erzgräbers"],
    ["legs", "Beinschienen des Erzgräbers"],
    ["feet", "Stiefel des Erzgräbers"],
  ]),
  ...dungeonSet("high-priestess", 27, [
    ["scepter", "Zepter der Sonnenpriesterin"],
    ["mace", "Skarabäuskolben"],
    ["head", "Krone von Neferet"],
    ["chest", "Gewand der Hohepriesterin"],
    ["arms", "Goldene Armreife"],
    ["legs", "Beinlinge des Tempels"],
    ["feet", "Sandalen der Wüste"],
  ]),
  ...dungeonSet("storm-lord", 42, [
    ["axe", "Donnerspalter"],
    ["staff", "Stab des Sturmfürsten"],
    ["head", "Kaelthars Sturmhelm"],
    ["chest", "Sturmpanzer"],
    ["arms", "Blitzhandschuhe"],
    ["legs", "Sturmbeinschienen"],
    ["feet", "Donnerstiefel"],
  ]),
  ...dungeonSet("void-lord", 60, [
    ["dagger", "Leerendorn"],
    ["shield", "Schild des Abgrunds"],
    ["head", "Krone der Leere"],
    ["chest", "Leerenpanzer"],
    ["arms", "Leerenklauen"],
    ["legs", "Beinschienen der Leere"],
    ["feet", "Schreiter der Leere"],
  ]),

  // Raid-Sets der Koop-Bosse (coopCombat.ts): je 2 Waffen und ein komplettes Rüstungsset
  ...raidSet("swamp-hydra", 20, [
    ["scepter", "Giftzahnzepter"],
    ["axe", "Hydrabeil"],
    ["head", "Dreikopfhelm"],
    ["chest", "Hydraschuppenpanzer"],
    ["arms", "Schuppenhandschuhe der Hydra"],
    ["legs", "Sumpfbeinschienen"],
    ["feet", "Sumpfstiefel der Hydra"],
  ]),
  ...raidSet("frost-giant", 40, [
    ["greataxe", "Frostspalter"],
    ["bow", "Eiszapfenbogen"],
    ["head", "Krone des Frostriesen"],
    ["chest", "Gletscherharnisch"],
    ["arms", "Frostfäuste"],
    ["legs", "Eisbeinschienen"],
    ["feet", "Gletscherstiefel"],
  ]),
  ...raidSet("world-eater", 60, [
    ["greatsword", "Klinge des Weltenendes"],
    ["staff", "Stab des Verschlingers"],
    ["head", "Krone des Verschlingers"],
    ["chest", "Panzer des Weltenendes"],
    ["arms", "Klauen des Verschlingers"],
    ["legs", "Beinschienen des Weltenendes"],
    ["feet", "Schreiter des Weltenendes"],
  ]),
];

function dungeonSet(bossId: string, level: number, items: [ItemType, string][]): BossItemSpec[] {
  return items.map(([type, name]) => ({ bossId, level, type, name, dungeon: true }));
}

function raidSet(bossId: string, level: number, items: [ItemType, string][]): BossItemSpec[] {
  return items.map(([type, name]) => ({ bossId, level, type, name, raid: true }));
}

/** Boss-Waffen übertreffen das stärkste Katalog-Item gleichen Typs und Levels deutlich, Rüstung etwas. */
export const BOSS_WEAPON_FACTOR = 1.35;
export const BOSS_ARMOR_FACTOR = 1.2;
/** Dungeon-Beute ist noch etwas stärker – Dungeons sind schwerer. */
export const DUNGEON_WEAPON_FACTOR = 1.45;
export const DUNGEON_ARMOR_FACTOR = 1.3;
/** Raid-Beute der Koop-Bosse – die stärkste Beute im Spiel. */
export const RAID_WEAPON_FACTOR = 1.55;
export const RAID_ARMOR_FACTOR = 1.4;

function buildBossItem(spec: BossItemSpec): ItemDef {
  const info = getItemType(spec.type);
  const peers = ITEMS.filter((i) => i.type === spec.type && i.requiredLevel === spec.level);
  const best = (key: "attack" | "armor") => Math.max(...peers.map((i) => i[key]));
  const weaponFactor = spec.raid ? RAID_WEAPON_FACTOR : spec.dungeon ? DUNGEON_WEAPON_FACTOR : BOSS_WEAPON_FACTOR;
  const armorFactor = spec.raid ? RAID_ARMOR_FACTOR : spec.dungeon ? DUNGEON_ARMOR_FACTOR : BOSS_ARMOR_FACTOR;
  const attack = info.baseAttack > 0 ? Math.round(best("attack") * weaponFactor) : 0;
  const armorValue = info.baseArmor > 0 ? Math.round(best("armor") * armorFactor) : 0;
  return {
    id: `boss-${spec.bossId}-${spec.type}`,
    kind: info.kind,
    type: spec.type,
    name: spec.name,
    icon: info.icon,
    armor: armorValue,
    attack,
    twoHanded: info.twoHanded,
    price: Math.round((armorValue + attack) * 4 * (1 + spec.level / 10)),
    requiredLevel: spec.level,
    bossId: spec.bossId,
  };
}

/** Einzigartige Boss-Items – nicht Teil von ITEMS, damit Händler und Quests sie nie anbieten. */
export const BOSS_ITEMS: readonly ItemDef[] = BOSS_ITEM_SPECS.map(buildBossItem);

/** Die Boss-Items eines Bosses: 5 bei Gebietsbossen, 7 bei Dungeon- und Koop-Bossen, leer bei normalen Kreaturen. */
export function getBossItems(bossId: string): ItemDef[] {
  return BOSS_ITEMS.filter((i) => i.bossId === bossId);
}

const ITEMS_BY_ID = new Map([...ITEMS, ...BOSS_ITEMS].map((i) => [i.id, i]));

/** Startausrüstung für neue Spielstände. */
export const STARTER_ITEM_IDS: readonly string[] = ["sword-0", "chest-0"];

export function getItem(itemId: string): ItemDef {
  const item = ITEMS_BY_ID.get(itemId);
  if (!item) throw new Error(`Unbekanntes Item: ${itemId}`);
  return item;
}

export function hasItem(itemId: string): boolean {
  return ITEMS_BY_ID.has(itemId);
}

export function getItemType(type: ItemType): ItemTypeInfo {
  const info = ITEM_TYPES.find((t) => t.type === type);
  if (!info) throw new Error(`Unbekannter Item-Typ: ${type}`);
  return info;
}

/** Items aus dem alten, kleinen Katalog (Spielstand v3) → passendes neues Item. */
const LEGACY_ITEMS: Record<string, [ItemType, number]> = {
  "wooden-sword": ["sword", 1],
  dagger: ["dagger", 1],
  "short-sword": ["sword", 3],
  "battle-axe": ["axe", 5],
  "war-hammer": ["mace", 8],
  "long-sword": ["sword", 10],
  "rune-blade": ["sword", 15],
};
const LEGACY_MATERIAL_LEVELS: Record<string, number> = { leather: 1, iron: 4, steel: 8, mithril: 12 };

export function migrateLegacyItemId(oldId: string): string | null {
  if (hasItem(oldId)) return oldId;
  const legacy = LEGACY_ITEMS[oldId];
  if (legacy) return `${legacy[0]}-${indexForLevel(legacy[1])}`;
  const [material, slot] = oldId.split("-");
  const level = LEGACY_MATERIAL_LEVELS[material];
  if (level && ARMOR_SLOTS.includes(slot as ArmorSlot)) return `${slot}-${indexForLevel(level)}`;
  return null;
}

export interface RarityInfo {
  key: Rarity;
  label: string;
  /** Faktor auf den Rüstungs-/Angriffswert aus dem Katalog. */
  statMultiplier: number;
  /** Auf wie viele verschiedene Attribute das Item einen Bonus gibt. */
  bonusCount: number;
  /** Stärke des Attributbonus, siehe `bonusValue`. */
  bonusFactor: number;
  /** Faktor auf den Verkaufswert. */
  priceMultiplier: number;
}

/** Seltenheitsstufen, aufsteigend. Je seltener, desto mehr und höhere Attributboni. */
export const RARITIES: readonly RarityInfo[] = [
  { key: "common", label: "Gewöhnlich", statMultiplier: 1, bonusCount: 0, bonusFactor: 0, priceMultiplier: 1 },
  { key: "rare", label: "Selten", statMultiplier: 1.2, bonusCount: 1, bonusFactor: 1, priceMultiplier: 2 },
  { key: "epic", label: "Episch", statMultiplier: 1.45, bonusCount: 2, bonusFactor: 1.5, priceMultiplier: 4 },
  { key: "legendary", label: "Legendär", statMultiplier: 1.75, bonusCount: 3, bonusFactor: 2.5, priceMultiplier: 8 },
];

const STAT_KEYS: readonly StatKey[] = ["strength", "intellect", "endurance", "charisma"];

export function getRarity(rarity: Rarity): RarityInfo {
  const info = RARITIES.find((r) => r.key === rarity);
  if (!info) throw new Error(`Unbekannte Seltenheit: ${rarity}`);
  return info;
}

/**
 * Höhe eines einzelnen Attributbonus: wächst mit Seltenheit und Item-Level.
 * Beispiel: seltenes Item Lv. 1 → +1, legendäres Item Lv. 60 → +40.
 */
export function bonusValue(rarity: Rarity, requiredLevel: number): number {
  const { bonusFactor } = getRarity(rarity);
  if (bonusFactor === 0) return 0;
  return Math.max(1, Math.round(bonusFactor * (1 + requiredLevel / 4)));
}

/**
 * Erzeugt ein Exemplar und würfelt seine Attributboni aus
 * (`bonusCount` verschiedene Attribute, je `bonusValue` Punkte).
 */
export function createItem(
  itemId: string,
  rarity: Rarity,
  uid: string,
  rng: () => number = Math.random,
): OwnedItem {
  const def = getItem(itemId);
  const pool = [...STAT_KEYS];
  const bonuses: Partial<Stats> = {};
  for (let i = 0; i < getRarity(rarity).bonusCount && pool.length > 0; i++) {
    const [stat] = pool.splice(Math.floor(rng() * pool.length), 1);
    bonuses[stat] = bonusValue(rarity, def.requiredLevel);
  }
  return { uid, itemId, rarity, bonuses };
}

/** Höchste Verbesserungsstufe beim Schmied. */
export const MAX_UPGRADE = 5;
/** Jede Verbesserungsstufe gibt diesen Anteil des Hauptwerts dazu (mindestens +1). */
export const UPGRADE_STEP = 0.06;

/** Hauptwert nach `upgrade` Verbesserungen: +6 % pro Stufe, mindestens +1 pro Stufe. */
export function upgradedValue(base: number, upgrade: number): number {
  if (base <= 0 || upgrade <= 0) return base;
  return base + Math.max(upgrade, Math.round(base * UPGRADE_STEP * upgrade));
}

/**
 * Endgültige Werte eines Exemplars. Verbesserungen beim Schmied wirken auf den
 * Hauptwert: Angriff bei Waffen, Rüstung bei Rüstungsteilen und Schilden.
 */
export function getItemStats(owned: OwnedItem): ItemStats {
  const def = getItem(owned.itemId);
  const { statMultiplier } = getRarity(owned.rarity);
  const upgrade = owned.upgrade ?? 0;
  const armor = Math.round(def.armor * statMultiplier);
  const attack = Math.round(def.attack * statMultiplier);
  return {
    def,
    rarity: owned.rarity,
    armor: attack > 0 ? armor : upgradedValue(armor, upgrade),
    attack: upgradedValue(attack, upgrade),
    bonuses: owned.bonuses,
    upgrade,
  };
}

/** Anteil des Kaufpreises, den der Händler beim Verkauf zahlt. */
export const SELL_RATE = 0.25;

/** Verkaufspreis beim Händler: ein Viertel des Kaufpreises (mind. 1 Gold), seltene Stücke sind mehr wert. */
export function sellPrice(owned: OwnedItem): number {
  return Math.max(1, Math.floor(getItem(owned.itemId).price * getRarity(owned.rarity).priceMultiplier * SELL_RATE));
}
