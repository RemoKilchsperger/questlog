// Skilltree: Pro Level-up gibt es einen Skillpunkt. Jeder Rang in einem
// Waffentyp erhöht den Schaden aller Waffen dieses Typs um 2 % (max. 5 Ränge
// = +10 %), beim Schild stattdessen dessen Rüstung.
// Zweihand- und Magierwaffen bauen auf ihrer Einhand-Variante auf:
// Sie lassen sich erst lernen, wenn diese mindestens Rang 3 hat.

import { getSetGearMultiplier } from "./bossSets";
import { getItem, getItemStats, getItemType } from "./items";
import { getLevel } from "./leveling";
import type { Character, Equipment, ItemType, WeaponType } from "./types";

/** Alle Waffentypen inkl. Schild – Schild-Ränge erhöhen die Rüstung statt des Schadens. */
export type SkillWeapon = WeaponType;
export type SkillRanks = Partial<Record<SkillWeapon, number>>;

export const SKILL_POINTS_PER_LEVEL = 1;
export const MAX_SKILL_RANK = 5;
export const SKILL_BONUS_PER_RANK = 0.02;
/** Nötiger Rang in der Voraussetzung, bevor ein aufbauender Skill gelernt werden kann. */
export const PREREQUISITE_RANK = 3;

export interface SkillNode {
  weapon: SkillWeapon;
  /** Muss zuerst auf PREREQUISITE_RANK gebracht werden */
  requires?: SkillWeapon;
}

export interface SkillBranch {
  id: string;
  name: string;
  icon: string;
  nodes: readonly SkillNode[];
}

export const SKILL_TREE: readonly SkillBranch[] = [
  {
    id: "blades",
    name: "Klingen",
    icon: "🗡️",
    nodes: [{ weapon: "dagger" }, { weapon: "sword" }, { weapon: "greatsword", requires: "sword" }],
  },
  { id: "axes", name: "Äxte", icon: "🪓", nodes: [{ weapon: "axe" }, { weapon: "greataxe", requires: "axe" }] },
  {
    id: "blunt",
    name: "Wuchtwaffen",
    icon: "🔨",
    nodes: [{ weapon: "mace" }, { weapon: "greathammer", requires: "mace" }],
  },
  {
    id: "arcane",
    name: "Arkane Waffen",
    icon: "🔱",
    nodes: [{ weapon: "scepter" }, { weapon: "staff", requires: "scepter" }],
  },
  { id: "defense", name: "Verteidigung", icon: "🛡️", nodes: [{ weapon: "shield" }] },
];

const NODES = SKILL_TREE.flatMap((b) => b.nodes);

/** Rang eines Skills – höchstens MAX_SKILL_RANK (ältere Stände konnten höher sein). */
export function skillRank(character: Character, weapon: SkillWeapon): number {
  return Math.min(MAX_SKILL_RANK, character.skills[weapon] ?? 0);
}

/** Begrenzt alle Ränge auf das Maximum – Punkte darüber werden so wieder frei. */
export function clampSkills(skills: SkillRanks): SkillRanks {
  return Object.fromEntries(
    Object.entries(skills).map(([weapon, rank]) => [weapon, Math.min(MAX_SKILL_RANK, rank ?? 0)]),
  ) as SkillRanks;
}

/** Durch Level-ups verdiente minus bereits vergebene Skillpunkte. */
export function unspentSkillPoints(character: Character): number {
  const earned = (getLevel(character.totalXp) - 1) * SKILL_POINTS_PER_LEVEL;
  const spent = NODES.reduce((sum, node) => sum + skillRank(character, node.weapon), 0);
  return Math.max(0, earned - spent);
}

/** Warum dieser Skill gerade nicht gelernt werden kann – oder null. */
export function skillBlocker(character: Character, weapon: SkillWeapon): string | null {
  const node = NODES.find((n) => n.weapon === weapon);
  if (!node) return "Unbekannter Skill.";
  if (skillRank(character, weapon) >= MAX_SKILL_RANK) return "Höchster Rang erreicht.";
  if (node.requires && skillRank(character, node.requires) < PREREQUISITE_RANK) {
    return `Benötigt Rang ${PREREQUISITE_RANK} in ${getItemType(node.requires).label}.`;
  }
  if (unspentSkillPoints(character) <= 0) return "Keine Skillpunkte – steige ein Level auf.";
  return null;
}

/** Steigert einen Skill um einen Rang. */
export function learnSkill(character: Character, weapon: SkillWeapon): Character {
  const blocker = skillBlocker(character, weapon);
  if (blocker) throw new Error(blocker);
  return { ...character, skills: { ...character.skills, [weapon]: skillRank(character, weapon) + 1 } };
}

/** Bonus eines Item-Typs durch Skills (0.1 = +10 %) – Schaden bei Waffen, Rüstung bei Schilden. */
export function skillPercent(character: Character, type: ItemType): number {
  const node = NODES.find((n) => n.weapon === type);
  return node ? skillRank(character, node.weapon) * SKILL_BONUS_PER_RANK : 0;
}

/** Schadensbonus eines Item-Typs – 0 für Schilde und Rüstung. */
export function skillDamagePercent(character: Character, type: ItemType): number {
  return type === "shield" ? 0 : skillPercent(character, type);
}

/** Zusätzliche Rüstung durch den Schild-Skill: Prozent auf die Rüstung angelegter Schilde (inkl. Set-Bonus). */
export function skillArmorBonus(character: Character, equipment: Equipment): number {
  let bonus = 0;
  for (const owned of [equipment.weapon1, equipment.weapon2]) {
    if (!owned || getItem(owned.itemId).type !== "shield") continue;
    bonus += getItemStats(owned).armor * skillPercent(character, "shield");
  }
  return Math.round(bonus * getSetGearMultiplier(equipment));
}

/**
 * Zusätzlicher Schaden durch Skills: Jede angelegte Waffe bekommt den
 * Prozentbonus ihres Typs auf ihren Angriffswert (inkl. Set-Bonus).
 */
export function skillDamageBonus(character: Character, equipment: Equipment): number {
  let bonus = 0;
  for (const owned of [equipment.weapon1, equipment.weapon2]) {
    if (!owned) continue;
    bonus += getItemStats(owned).attack * skillDamagePercent(character, getItem(owned.itemId).type);
  }
  return bonus * getSetGearMultiplier(equipment);
}
