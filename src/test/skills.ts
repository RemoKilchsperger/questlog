// Test-Hilfen: ein Held, der seine Skillpunkte in einer festen Reihenfolge verteilt.

import { learnSkill, skillBlocker, SKILL_TREE, type SkillId, type SkillPath } from "../domain/skills";
import type { Character } from "../domain/types";

/**
 * Die Knoten eines Pfads von oben nach unten, jeder bis zum höchsten Rang – bei der
 * Gabelung der erste (oder `fork`), am Ende die Meisterschaft.
 */
export function pathOrder(path: SkillPath, fork: 0 | 1 = 0): SkillId[] {
  const nodes = SKILL_TREE.filter((n) => n.path === path).sort((a, b) => a.tier - b.tier || a.col - b.col);
  const forks = nodes.filter((n) => n.fork);
  return nodes
    .filter((n) => !n.fork || n === forks[fork])
    .flatMap((n) => Array.from({ length: n.maxRank }, () => n.id));
}

/** Lernt die Knoten der Reihe nach, solange Punkte da sind – gesperrte werden übersprungen. */
export function withSkills(character: Character, order: readonly SkillId[]): Character {
  let next = character;
  for (const id of order) if (skillBlocker(next, id) === null) next = learnSkill(next, id);
  return next;
}
