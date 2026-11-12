// Schwächen und Resistenzen: Jede Kreatur (auch Bosse, Begleiter und Raid-Bosse)
// nimmt von manchen Schadensarten mehr, von anderen weniger Schaden – und ist
// gegen manche Zustände immun. So zählt, mit welcher Waffe man in welches Gebiet
// geht. Gilt solo und im Koop.
//
// Schadensarten der Waffen – normale Angriffe zählen mit der Hauptwaffe (die
// erste Waffe, die kein Schild ist), Fähigkeiten mit ihrer eigenen Waffe (Mordschlag: Wucht; Heiliger
// Hammer: Wucht oder Magie, was wirksamer ist):
//   - Klingen: Schwert, Zweihandschwert, Axt, Grossaxt
//   - Wucht:   Streitkolben, Grosshammer, Schild
//   - Stich:   Dolch, Bogen
//   - Magie:   Stab, Zepter
// Dazu Gift, Feuer und Bluten (Schaden über Zeit).

import type { AbilityDef } from "./abilities";
import { AREAS } from "./creatures";
import type { SkillWeapon } from "./skills";

export type DamageKind = "blade" | "blunt" | "pierce" | "magic";
export type DotKind = "poison" | "burn" | "bleed";
export type Matchup = DamageKind | DotKind;

/** Mehr Schaden bei einer Schwäche … */
export const WEAK_FACTOR = 1.3;
/** … weniger bei einer Resistenz. Immun gibt es nur gegen Gift, Feuer und Bluten. */
export const RESIST_FACTOR = 0.8;

export const WEAPON_KIND: Record<SkillWeapon, DamageKind> = {
  sword: "blade",
  greatsword: "blade",
  axe: "blade",
  greataxe: "blade",
  mace: "blunt",
  greathammer: "blunt",
  shield: "blunt",
  dagger: "pierce",
  bow: "pierce",
  staff: "magic",
  scepter: "magic",
};

/**
 * Schadensart einer Fähigkeit – null, wenn sie nicht trifft (Heilung, Schutz). Mit `creatureId` die
 * wirksamere, falls die Fähigkeit auch anders zählen kann (`altKind`, Heiliger Hammer).
 */
export function abilityKind(ability: Pick<AbilityDef, "weapon" | "kind" | "altKind" | "hits">, creatureId?: string): DamageKind | null {
  if (ability.hits === 0) return null;
  const kind = ability.kind ?? WEAPON_KIND[ability.weapon];
  return creatureId === undefined ? kind : bestKind(creatureId, [kind, ability.altKind]);
}

/** Die wirksamste Schadensart gegen diese Kreatur – bei Gleichstand die erste der Liste. */
export function bestKind(creatureId: string, kinds: readonly (DamageKind | null | undefined)[]): DamageKind | null {
  let best: DamageKind | null = null;
  for (const kind of kinds) {
    if (kind && (best === null || matchupFactor(creatureId, kind) > matchupFactor(creatureId, best))) best = kind;
  }
  return best;
}

export const MATCHUP_LABELS: Record<Matchup, { name: string; icon: string; detail: string }> = {
  blade: { name: "Klingen", icon: "⚔️", detail: "Schwert, Zweihandschwert, Axt, Grossaxt" },
  blunt: { name: "Wucht", icon: "🔨", detail: "Streitkolben, Grosshammer, Schild" },
  pierce: { name: "Stich", icon: "🏹", detail: "Dolch, Bogen" },
  magic: { name: "Magie", icon: "🔮", detail: "Stab, Zepter" },
  poison: { name: "Gift", icon: "☠️", detail: "Gift-Schaden über Zeit" },
  burn: { name: "Feuer", icon: "🔥", detail: "Feuer-Schaden über Zeit" },
  bleed: { name: "Bluten", icon: "🩸", detail: "Blutungs-Schaden über Zeit" },
};

export interface CreatureMatchups {
  weak?: Matchup[];
  resist?: Matchup[];
  immune?: DotKind[];
}

/** Nach Kreatur-Id – Gebiete, Dungeons und Raid-Bosse. Fehlt eine Kreatur, hat sie weder Schwächen noch Resistenzen. */
export const CREATURE_MATCHUPS: Record<string, CreatureMatchups> = {
  // Düsterwald – zum Einstieg nur Schwächen
  "giant-rat": { weak: ["blunt"] },
  "grey-wolf": { weak: ["pierce"] },
  "forest-spider": { weak: ["blade"], resist: ["poison"] },
  "goblin-raider": { weak: ["magic"] },
  "goblin-chief": { weak: ["magic"], resist: ["pierce"] },
  // Nebelsümpfe
  "marsh-toad": { weak: ["blade"], resist: ["blunt"] },
  "bog-serpent": { weak: ["blunt"], immune: ["poison"] },
  "bog-corpse": { weak: ["burn"], resist: ["pierce"], immune: ["poison", "bleed"] },
  "blood-swarm": { weak: ["magic", "burn"], resist: ["blunt"] },
  "ancient-lizard": { weak: ["pierce"], immune: ["poison"] },
  // Kristallhöhlen
  "cave-bat": { weak: ["pierce"], resist: ["blunt"] },
  "stone-golem": { weak: ["blunt"], resist: ["blade", "pierce"], immune: ["poison", "bleed"] },
  "crystal-scorpion": { weak: ["blunt"], resist: ["blade"], immune: ["poison"] },
  "rock-worm": { weak: ["magic"], resist: ["pierce"] },
  "cave-eye": { weak: ["pierce"], resist: ["magic"] },
  // Frostgipfel
  "ice-bear": { weak: ["burn"], resist: ["blunt"] },
  "frost-elemental": { weak: ["blunt", "burn"], resist: ["blade"], immune: ["poison", "bleed"] },
  "snow-wolf": { weak: ["blade", "burn"] },
  "frost-troll": { weak: ["burn"], resist: ["blunt", "bleed"] },
  "primal-mammoth": { weak: ["pierce"], resist: ["blunt"] },
  // Schattenruinen
  "skeleton-warrior": { weak: ["blunt"], resist: ["pierce"], immune: ["poison", "bleed"] },
  "wailing-ghost": { weak: ["magic"], resist: ["blade", "pierce"], immune: ["poison", "bleed"] },
  bloodsucker: { weak: ["pierce", "burn"], resist: ["bleed"] },
  "dark-sorcerer": { weak: ["blade"], resist: ["magic"] },
  "lich-king": { weak: ["blunt"], resist: ["magic"], immune: ["poison", "bleed"] },
  // Drachenhort
  "fire-salamander": { weak: ["blade"], immune: ["burn"] },
  "flame-elemental": { weak: ["magic"], resist: ["blade"], immune: ["burn", "poison", "bleed"] },
  "young-dragon": { weak: ["pierce"], resist: ["blade"], immune: ["burn"] },
  "demon-guard": { weak: ["magic"], resist: ["blade"], immune: ["burn"] },
  ignaroth: { weak: ["pierce"], resist: ["blade"], immune: ["burn"] },
  // Verlassene Mine
  "mine-rat": { weak: ["blunt"] },
  "kobold-blaster": { weak: ["pierce"], resist: ["burn"] },
  "pit-spider": { weak: ["blade"], immune: ["poison"] },
  "mine-foreman": { weak: ["magic"], resist: ["blunt"] },
  "ore-king": { weak: ["magic"], resist: ["blade"] },
  // Versunkener Tempel
  "temple-guardian": { weak: ["blunt"], resist: ["blade"] },
  "cobra-priest": { weak: ["blade"], resist: ["magic"], immune: ["poison"] },
  mummy: { weak: ["burn"], resist: ["pierce"], immune: ["poison", "bleed"] },
  "tomb-warden": { weak: ["burn"], resist: ["blade"], immune: ["poison"] },
  "high-priestess": { weak: ["blade"], resist: ["magic"] },
  // Gewitterturm
  "thunder-elemental": { weak: ["blunt"], resist: ["magic"], immune: ["poison", "bleed"] },
  "stone-gargoyle": { weak: ["blunt"], resist: ["blade", "pierce"], immune: ["poison", "bleed"] },
  "lightning-caller": { weak: ["pierce"], resist: ["magic"] },
  "thunder-colossus": { weak: ["pierce"], resist: ["blunt", "magic"], immune: ["bleed"] },
  "storm-lord": { weak: ["blade"], resist: ["magic"] },
  // Abgrund der Leere
  "void-crawler": { weak: ["magic"], resist: ["pierce"] },
  "shadow-demon": { weak: ["magic"], resist: ["blade"] },
  "soul-eater": { weak: ["blunt"], resist: ["magic"], immune: ["poison"] },
  "abyss-tyrant": { weak: ["burn"], resist: ["magic"] },
  "void-lord": { weak: ["pierce"], resist: ["magic"] },
  // Mimics (Truhen im Dungeon und nach Siegen in den Gebieten): Holz brennt, Eisenbeschläge halten Klingen ab
  ...Object.fromEntries(
    ["mimic-mine", "mimic-temple", "mimic-storm", "mimic-void", ...AREAS.flatMap((a) => (a.mimics ?? []).map((m) => m.id))].map(
      (id): [string, CreatureMatchups] => [id, { weak: ["burn", "blunt"], resist: ["blade"], immune: ["poison"] }],
    ),
  ),
  // Raid-Bosse
  "swamp-hydra": { weak: ["burn", "blade"], immune: ["poison"] },
  "frost-giant": { weak: ["burn", "blunt"], resist: ["blade"] },
  "world-eater": { weak: ["magic"], resist: ["pierce"] },
};

export function getMatchups(creatureId: string): CreatureMatchups {
  return CREATURE_MATCHUPS[creatureId] ?? {};
}

/** Wie wirkt diese Schadensart gegen die Kreatur? */
export function matchupOf(creatureId: string, kind: Matchup): "weak" | "resist" | "immune" | null {
  const m = getMatchups(creatureId);
  if (m.immune?.includes(kind as DotKind)) return "immune";
  if (m.weak?.includes(kind)) return "weak";
  if (m.resist?.includes(kind)) return "resist";
  return null;
}

/** Faktor auf den Schaden dieser Art gegen die Kreatur (0 bei Immunität). */
export function matchupFactor(creatureId: string, kind: Matchup | null): number {
  if (!kind) return 1;
  const result = matchupOf(creatureId, kind);
  return result === "immune" ? 0 : result === "weak" ? WEAK_FACTOR : result === "resist" ? RESIST_FACTOR : 1;
}

/** Hauptwaffe für normale Angriffe: die erste Waffe, die kein Schild ist (sonst der Schild). */
export function mainWeapon(weapons: readonly SkillWeapon[]): SkillWeapon | null {
  return weapons.find((w) => w !== "shield") ?? weapons[0] ?? null;
}
