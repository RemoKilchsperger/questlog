// Test-Hilfen: ein Held, der seine Skillpunkte in einer festen Reihenfolge verteilt.

import { learnSkill, skillBlocker, SKILL_TREE, TIER_POINTS, type SkillId, type SkillNode, type SkillPath } from "../domain/skills";
import type { Character } from "../domain/types";

/** Die Knoten eines Pfads von oben nach unten (Stufe, dann Spalte). */
const pathNodes = (path: SkillPath): SkillNode[] =>
  SKILL_TREE.filter((n) => n.path === path).sort((a, b) => a.tier - b.tier || a.col - b.col);

/** Alle Ränge eines Knotens hintereinander. */
const ranksOf = (node: SkillNode): SkillId[] => Array.from({ length: node.maxRank }, () => node.id);

/** Die Meisterschaften eines Pfads (Stufe 5) – mit Gabel zwei, sonst eine. */
const masteries = (path: SkillPath): SkillNode[] => pathNodes(path).filter((n) => n.tier === 5);

/**
 * Die Knoten eines Pfads von oben nach unten, jeder bis zum höchsten Rang – bei der
 * Gabelung der Stufe 3 der erste (oder `fork`), am Ende die Meisterschaft (`master`: welche der Gabel).
 */
export function pathOrder(path: SkillPath, fork: 0 | 1 = 0, master: 0 | 1 = 0): SkillId[] {
  const nodes = pathNodes(path);
  const forks = nodes.filter((n) => n.tier < 5 && n.fork);
  const masters = masteries(path);
  return nodes
    .filter((n) => (n.tier === 5 ? n === (masters[master] ?? masters[0]) : !n.fork || n === forks[fork]))
    .flatMap(ranksOf);
}

/**
 * Meisterpfad wie ein Spieler, der früh meistert: genau so viele Punkte wie die Schwelle der
 * Meisterschaft (TIER_POINTS[5]) – Stufe 1–2 von oben, ein Knoten der Gabelung, auf Stufe 4 der
 * Rest (mindestens ein Rang, sonst fehlt die Voraussetzung) – dann die Meisterschaft.
 * Neuer Baum: 12 + 1 = 13 Punkte, alter Baum: 15 + 1 = 16.
 */
export function masterPathOrder(path: SkillPath, fork: 0 | 1 = 0, master: 0 | 1 = 0): SkillId[] {
  const nodes = pathNodes(path);
  const budget = TIER_POINTS[5];
  const upper = nodes.filter((n) => n.tier <= 2).flatMap(ranksOf);
  const third = nodes.filter((n) => n.tier === 3 && n.fork)[fork] ?? nodes.find((n) => n.tier === 3)!;
  const fourth = nodes.filter((n) => n.tier === 4).flatMap(ranksOf);
  const top = upper.slice(0, Math.min(upper.length, budget - 2));
  const deep = fourth.slice(0, budget - top.length - 1);
  const masters = masteries(path);
  return [...top, third.id, ...deep, (masters[master] ?? masters[0]).id];
}

/** Lernt die Knoten der Reihe nach, solange Punkte da sind – gesperrte werden übersprungen. */
export function withSkills(character: Character, order: readonly SkillId[]): Character {
  let next = character;
  for (const id of order) if (skillBlocker(next, id) === null) next = learnSkill(next, id);
  return next;
}
