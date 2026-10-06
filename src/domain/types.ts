import type { AbilityId } from "./abilities";
// Zentrale Datentypen. Bewusst frei von React/Zustand, damit dieselben
// Typen später im Backend (Supabase Edge Function) und im Kampfsystem
// (Phaser) wiederverwendet werden können.

/** Geschätzter Zeitaufwand einer Quest. Bestimmt die Belohnung. */
export type Effort = "quick" | "short" | "medium" | "long" | "epic";

/** Lebensbereich einer Quest. Jeder Bereich trainiert ein Attribut. */
export type Category = "body" | "mind" | "daily" | "social";

/** Attribute des Charakters – Grundlage für das spätere Kampfsystem. */
export type StatKey = "strength" | "intellect" | "endurance" | "charisma";
export type Stats = Record<StatKey, number>;

export type QuestStatus = "open" | "done";

export interface Quest {
  id: string;
  title: string;
  description?: string;
  effort: Effort;
  category: Category;
  dueDate?: string; // ISO-Datum (yyyy-mm-dd)
  status: QuestStatus;
  createdAt: string;
  completedAt?: string;
  /** Tatsächlich erhaltene Belohnung, wird beim Abschluss gespeichert. */
  reward?: Reward;
  /** Tägliche Bonusquest (src/domain/bonusQuests.ts) – gibt mehr Belohnung. */
  bonus?: boolean;
}

export interface Reward {
  xp: number;
  gold: number;
  stat: StatKey;
  statPoints: number;
  /** Aufgefüllte Kampfpunkte (fehlt bei Quests, die vor den Kampfpunkten erledigt wurden) */
  battlePoints?: number;
}

/** Zufällige Item-Belohnung einer Quest (oder null, wenn nichts gedroppt ist). */
export type Loot = OwnedItem | null;

export interface Character {
  name: string;
  /** Gesamt-XP seit Spielbeginn. Level wird daraus berechnet, nie gespeichert. */
  totalXp: number;
  gold: number;
  /** Essenz aus zerlegten Items (src/domain/forge.ts). */
  essence: number;
  stats: Stats;
  /** Bereits verteilte Level-up-Punkte (verfügbar: siehe `unspentPoints`). */
  spentPoints: number;
  /** Verfügbare Kampfpunkte – jeder Kampf kostet einen (src/domain/battlePoints.ts). */
  battlePoints: number;
  /** Zuletzt gutgeschriebener 6-Stunden-Abschnitt der Gratis-Kampfpunkte (siehe `regenSlot`). */
  battlePointSlot: number;
  /** Ränge im Skilltree pro Waffentyp (src/domain/skills.ts). */
  skills: Partial<Record<WeaponType, number>>;
  /** Freigeschaltete Kampf-Fähigkeiten – erst nach dem Meistern der Waffe (src/domain/skills.ts). */
  abilities: AbilityId[];
}

/** Rüstungsplätze am Körper. */
export type ArmorSlot = "head" | "chest" | "arms" | "legs" | "feet";
/** Zwei Waffenhände – jede Waffe passt in beide. */
export type WeaponSlot = "weapon1" | "weapon2";
export type EquipSlot = ArmorSlot | WeaponSlot;

export type WeaponType =
  | "dagger"
  | "sword"
  | "greatsword"
  | "shield"
  | "axe"
  | "greataxe"
  | "staff"
  | "scepter"
  | "mace"
  | "greathammer"
  | "bow";

/** Rüstungsklasse: leicht (Stoff), mittel (Leder) oder schwer (Metall) – siehe armorClasses.ts. */
export type ArmorClass = "light" | "medium" | "heavy";

/** Item-Typ: ein Rüstungsplatz oder eine Waffenart. Pro Typ (und Rüstungsklasse) gibt es 200 Items. */
export type ItemType = ArmorSlot | WeaponType;

/** Item-Vorlage aus dem Katalog (src/domain/items.ts). */
export interface ItemDef {
  id: string;
  kind: "armor" | "weapon";
  type: ItemType;
  name: string;
  icon: string;
  /** Rüstungsteile und Schilde geben Rüstung, Waffen Angriff. */
  armor: number;
  attack: number;
  /** Zweihandwaffen belegen beide Waffenhände. */
  twoHanded: boolean;
  /** Nur Rüstungsteile: leicht, mittel oder schwer */
  armorClass?: ArmorClass;
  price: number;
  requiredLevel: number;
  /** Einzigartiges Boss-Item: nur als Beute dieses Bosses erhältlich (nie beim Händler oder aus Quests). */
  bossId?: string;
}

/** Seltenheitsstufe eines Exemplars – bestimmt Grundwert-Bonus und Attributboni. */
export type Rarity = "common" | "rare" | "epic" | "legendary";

/**
 * Ein konkretes Exemplar im Besitz des Helden (man kann ein Item mehrfach besitzen).
 * Seltenheit und Attributboni werden beim Drop ausgewürfelt und gespeichert.
 */
export interface OwnedItem {
  uid: string;
  itemId: string;
  rarity: Rarity;
  bonuses: Partial<Stats>;
  /** Verbesserungsstufe beim Schmied (0 bzw. fehlend = nicht verbessert, siehe forge.ts). */
  upgrade?: number;
}

/** Endgültige Werte eines Exemplars (Katalogwert × Seltenheit + Boni). */
export interface ItemStats {
  def: ItemDef;
  rarity: Rarity;
  armor: number;
  attack: number;
  bonuses: Partial<Stats>;
  /** Verbesserungsstufe beim Schmied */
  upgrade: number;
}

export type Equipment = Record<EquipSlot, OwnedItem | null>;

/** Alles, was der Held mit sich trägt: Rucksack + angelegte Ausrüstung. */
export interface Gear {
  inventory: OwnedItem[];
  equipment: Equipment;
}

/** Aus der Ausrüstung abgeleitete Kampfwerte. */
export interface CombatStats {
  armor: number;
  attack: number;
}
