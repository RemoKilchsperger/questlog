// Skilltree: Pro Level-up gibt es einen Skillpunkt. Jeder Rang in einem
// Waffentyp erhöht den Schaden aller Waffen dieses Typs um 2 % (max. 5 Ränge
// = +10 %), beim Schild stattdessen dessen Rüstung. Alle Waffentypen sind
// unabhängig voneinander lernbar – auch Zweihandwaffen.
// Ab Rang 3 in einem Waffentyp kann man für einen weiteren Skillpunkt dessen
// erste Kampf-Fähigkeit freischalten – ab Level 25 für zwei Skillpunkte die
// zweite, unabhängig von der ersten. Zweihandwaffen haben eine dritte Fähigkeit,
// die genauso viel kostet und ab demselben Level verfügbar ist wie die zweite.
// Gegen viel Gold lassen sich alle Skillpunkte zurücksetzen.

import { getAbility, type AbilityId } from "./abilities";
import { getSetGearMultiplier } from "./bossSets";
import { getItem, getItemStats, getItemType } from "./items";
import { getLevel } from "./leveling";
import type { Character, Equipment, ItemType, WeaponType } from "./types";

/** Alle Waffentypen inkl. Schild – Schild-Ränge erhöhen die Rüstung statt des Schadens. */
export type SkillWeapon = WeaponType;
export type SkillRanks = Partial<Record<SkillWeapon, number>>;

export const SKILL_POINTS_PER_LEVEL = 1;
export const MAX_SKILL_RANK = 5;
/** Ab diesem Rang lassen sich die Fähigkeiten eines Waffentyps freischalten. */
export const ABILITY_UNLOCK_RANK = 3;
export const SKILL_BONUS_PER_RANK = 0.02;
/** Skillpunkte für das Freischalten der ersten bzw. zweiten (und dritten) Fähigkeit einer Waffe. */
export const ABILITY_COST = 1;
export const SECOND_ABILITY_COST = 2;
/** Ab diesem Level lassen sich die zweite und dritte Fähigkeit freischalten. */
export const SECOND_ABILITY_LEVEL = 25;

export function abilityCost(id: AbilityId): number {
  return getAbility(id).tier === 1 ? ABILITY_COST : SECOND_ABILITY_COST;
}

export interface SkillNode {
  weapon: SkillWeapon;
}

/** Ein eigener Skill pro Waffentyp – Einhand, Zweihand und Schild, alle unabhängig. */
export const SKILL_TREE: readonly SkillNode[] = [
  { weapon: "dagger" },
  { weapon: "sword" },
  { weapon: "greatsword" },
  { weapon: "axe" },
  { weapon: "greataxe" },
  { weapon: "mace" },
  { weapon: "greathammer" },
  { weapon: "scepter" },
  { weapon: "staff" },
  { weapon: "bow" },
  { weapon: "shield" },
];


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
  const ranks = SKILL_TREE.reduce((sum, node) => sum + skillRank(character, node.weapon), 0);
  const abilities = character.abilities.reduce((sum, id) => sum + abilityCost(id), 0);
  return Math.max(0, earned - ranks - abilities);
}

export function hasAbility(character: Character, id: AbilityId): boolean {
  return character.abilities.includes(id);
}

/** Warum diese Fähigkeit gerade nicht freigeschaltet werden kann – oder null. */
export function abilityUnlockBlocker(character: Character, id: AbilityId): string | null {
  const ability = getAbility(id);
  if (hasAbility(character, id)) return "Bereits freigeschaltet.";
  if (skillRank(character, ability.weapon) < ABILITY_UNLOCK_RANK) {
    return `Erst ${getItemType(ability.weapon).label} auf Rang ${ABILITY_UNLOCK_RANK} bringen.`;
  }
  if (ability.tier > 1) {
    if (getLevel(character.totalXp) < SECOND_ABILITY_LEVEL) return `Ab Level ${SECOND_ABILITY_LEVEL}.`;
  }
  const cost = abilityCost(id);
  if (unspentSkillPoints(character) < cost) {
    return cost > 1 ? `Braucht ${cost} Skillpunkte.` : "Keine Skillpunkte – steige ein Level auf.";
  }
  return null;
}

/** Schaltet eine Kampf-Fähigkeit frei. */
export function unlockAbility(character: Character, id: AbilityId): Character {
  const blocker = abilityUnlockBlocker(character, id);
  if (blocker) throw new Error(blocker);
  return { ...character, abilities: [...character.abilities, id] };
}

/** Warum dieser Skill gerade nicht gelernt werden kann – oder null. */
export function skillBlocker(character: Character, weapon: SkillWeapon): string | null {
  const node = SKILL_TREE.find((n) => n.weapon === weapon);
  if (!node) return "Unbekannter Skill.";
  if (skillRank(character, weapon) >= MAX_SKILL_RANK) return "Höchster Rang erreicht.";
  if (unspentSkillPoints(character) <= 0) return "Keine Skillpunkte – steige ein Level auf.";
  return null;
}

/** Steigert einen Skill um einen Rang. */
export function learnSkill(character: Character, weapon: SkillWeapon): Character {
  const blocker = skillBlocker(character, weapon);
  if (blocker) throw new Error(blocker);
  return { ...character, skills: { ...character.skills, [weapon]: skillRank(character, weapon) + 1 } };
}

/**
 * Gold für das Zurücksetzen aller Skillpunkte: 12.5 × Level × (1 + Level/10). Lv. 20 → 750.
 * Bewusst günstig, damit sich das Ausprobieren anderer Klassen und Builds lohnt.
 */
export function skillResetCost(level: number): number {
  return Math.round(12.5 * level * (1 + level / 10));
}

/** Warum die Skillpunkte gerade nicht zurückgesetzt werden können – oder null. */
export function skillResetBlocker(character: Character): string | null {
  const spent = SKILL_TREE.some((n) => skillRank(character, n.weapon) > 0) || character.abilities.length > 0;
  if (!spent) return "Du hast noch keine Skillpunkte vergeben.";
  if (character.gold < skillResetCost(getLevel(character.totalXp))) return "Nicht genug Gold.";
  return null;
}

/** Setzt alle Ränge und Fähigkeiten zurück – die Skillpunkte sind wieder frei. */
export function resetSkills(character: Character): Character {
  const blocker = skillResetBlocker(character);
  if (blocker) throw new Error(blocker);
  return {
    ...character,
    gold: character.gold - skillResetCost(getLevel(character.totalXp)),
    skills: {},
    abilities: [],
  };
}

/** Bonus eines Item-Typs durch Skills (0.1 = +10 %) – Schaden bei Waffen, Rüstung bei Schilden. */
export function skillPercent(character: Character, type: ItemType): number {
  const node = SKILL_TREE.find((n) => n.weapon === type);
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
