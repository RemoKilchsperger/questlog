// Boss-Fähigkeiten: Jeder Gebietsboss setzt alle paar Runden eine besondere
// Attacke ein – statt seines normalen Angriffs. Sie wird eine Runde vorher
// angekündigt, damit man reagieren kann: Bollwerk (Schild) blockt sie komplett,
// ein Betäubender Schlag (Streitkolben) verhindert sie.
//
// Dungeon-Bosse haben zwei Fähigkeiten, die sich abwechseln: erst eine gegen
// ein einzelnes Ziel, dann eine gegen die ganze Gruppe (`target: "group"`).
// Solo treffen beide den Helden, im Koop trifft die zweite alle (coopCombat.ts).

export interface BossAbilityDef {
  /** Eindeutig – bei der ersten Fähigkeit eines Bosses gleich seiner Id */
  id: string;
  bossId: string;
  /** Im Koop: ein Ziel (Standard) oder die ganze Gruppe */
  target?: "single" | "group";
  name: string;
  icon: string;
  description: string;
  /** Eingesetzt in jeder Runde, deren Nummer durch `every` teilbar ist */
  every: number;
  /** Faktor auf den Schaden des Bosses – pro Treffer */
  multiplier: number;
  hits?: number;
  ignoreArmor?: boolean;
  /** Vergiftet den Helden: Anteil des Boss-Schadens pro Runde */
  poison?: { percent: number; rounds: number };
  /** Setzt den Helden in Brand: Anteil des Boss-Schadens pro Runde */
  burn?: { percent: number; rounds: number };
  /** Lässt den Helden bluten: Anteil des Boss-Schadens pro Runde */
  bleed?: { percent: number; rounds: number };
  /** Heilt den Boss um diesen Anteil des verursachten Schadens */
  drain?: number;
  /** Raubt dem Helden so viel Mana */
  manaBurn?: number;
}

export const BOSS_ABILITIES: readonly BossAbilityDef[] = [
  {
    id: "goblin-chief",
    bossId: "goblin-chief",
    name: "Rasender Hieb",
    icon: "🪓",
    description: "Drei wilde Hiebe hintereinander.",
    every: 3,
    multiplier: 0.6,
    hits: 3,
  },
  {
    id: "ancient-lizard",
    bossId: "ancient-lizard",
    name: "Giftbiss",
    icon: "🐍",
    description: "Ein Biss, der den Helden 3 Runden lang vergiftet.",
    every: 3,
    multiplier: 1,
    poison: { percent: 0.3, rounds: 3 },
  },
  {
    id: "cave-eye",
    bossId: "cave-eye",
    name: "Lähmender Blick",
    icon: "👁️",
    description: "Ein Blick, der jede Rüstung durchdringt und 30 Mana raubt.",
    every: 3,
    multiplier: 1.1,
    ignoreArmor: true,
    manaBurn: 30,
  },
  {
    id: "primal-mammoth",
    bossId: "primal-mammoth",
    name: "Erdstampfer",
    icon: "🦣",
    description: "Ein gewaltiges Stampfen mit 2,5-fachem Schaden.",
    every: 4,
    multiplier: 2.5,
  },
  {
    id: "lich-king",
    bossId: "lich-king",
    name: "Lebensentzug",
    icon: "💀",
    description: "Saugt Leben aus dem Helden und heilt sich um den vollen Schaden.",
    every: 3,
    multiplier: 1.3,
    drain: 1,
  },
  {
    id: "ignaroth",
    bossId: "ignaroth",
    name: "Feueratem",
    icon: "🔥",
    description: "Ein Flammenstoss, der Rüstung ignoriert und 2 Runden nachbrennt.",
    every: 3,
    multiplier: 1.6,
    ignoreArmor: true,
    burn: { percent: 0.25, rounds: 2 },
  },

  // Dungeon-Bosse: je eine Fähigkeit gegen ein Ziel und eine gegen die Gruppe, abwechselnd
  {
    id: "ore-king-pick",
    bossId: "ore-king",
    name: "Spitzhackenhieb",
    icon: "⛏️",
    description: "Ein wuchtiger Hieb mit der Spitzhacke: doppelter Schaden, die Wunde blutet 2 Runden lang.",
    every: 3,
    multiplier: 2,
    bleed: { percent: 0.3, rounds: 2 },
  },
  {
    id: "ore-king",
    bossId: "ore-king",
    target: "group",
    name: "Erzlawine",
    icon: "🪨",
    description: "Lässt Gestein herabstürzen: doppelter Schaden, der Rüstung ignoriert.",
    every: 3,
    multiplier: 2,
    ignoreArmor: true,
  },
  {
    id: "high-priestess-spear",
    bossId: "high-priestess",
    name: "Sonnenspeer",
    icon: "☀️",
    description: "Ein gleissender Speer aus Licht: doppelter Schaden, der Rüstung ignoriert.",
    every: 3,
    multiplier: 2,
    ignoreArmor: true,
  },
  {
    id: "high-priestess",
    bossId: "high-priestess",
    target: "group",
    name: "Fluch der Mumie",
    icon: "𓂀",
    description: "Ein Fluch, der 25 Mana raubt und 4 Runden lang Lebenskraft zehrt.",
    every: 3,
    multiplier: 0.8,
    manaBurn: 25,
    poison: { percent: 0.3, rounds: 4 },
  },
  {
    id: "storm-lord-thunder",
    bossId: "storm-lord",
    name: "Donnerschlag",
    icon: "🌩️",
    description: "Ein einzelner, gewaltiger Blitz: 2,4-facher Schaden, der Rüstung ignoriert.",
    every: 3,
    multiplier: 2.4,
    ignoreArmor: true,
  },
  {
    id: "storm-lord",
    bossId: "storm-lord",
    target: "group",
    name: "Kettenblitz",
    icon: "⚡",
    description: "Drei Blitze hintereinander, die Rüstung ignorieren.",
    every: 3,
    multiplier: 0.75,
    hits: 3,
    ignoreArmor: true,
  },
  {
    id: "void-lord",
    bossId: "void-lord",
    name: "Leerenschlund",
    icon: "🌀",
    description: "Verschlingt Lebenskraft und Mana: 1,6-facher Schaden, heilt sich voll darum, raubt 25 Mana.",
    every: 3,
    multiplier: 1.6,
    drain: 1,
    manaBurn: 25,
  },
  {
    id: "void-lord-wave",
    bossId: "void-lord",
    target: "group",
    name: "Leerenwelle",
    icon: "🌑",
    description: "Eine Welle aus Leere: 1,4-facher Schaden, der Rüstung ignoriert – der Leerenfürst heilt sich darum, dazu 15 Mana Verlust.",
    every: 3,
    multiplier: 1.4,
    ignoreArmor: true,
    drain: 1,
    manaBurn: 15,
  },
];

/** Alle Fähigkeiten eines Bosses in Einsatzreihenfolge – leer für normale Kreaturen. */
export function getBossAbilities(creatureId: string): BossAbilityDef[] {
  return BOSS_ABILITIES.filter((a) => a.bossId === creatureId);
}

/** Erste Fähigkeit eines Bosses – oder null. */
export function getBossAbility(creatureId: string): BossAbilityDef | null {
  return getBossAbilities(creatureId)[0] ?? null;
}

export function getBossAbilityById(id: string): BossAbilityDef | null {
  return BOSS_ABILITIES.find((a) => a.id === id) ?? null;
}

/**
 * Welche Fähigkeit in Runde `round` dran ist: alle `every` Runden eine, mehrere
 * Fähigkeiten im Wechsel (Runde 3 die erste, Runde 6 die zweite …). Gemeinsam
 * für Solo- und Koop-Kampf.
 */
export function abilityForRound<T extends { every: number }>(abilities: readonly T[], round: number): T | null {
  if (abilities.length === 0) return null;
  const { every } = abilities[0];
  if (round % every !== 0) return null;
  return abilities[(round / every - 1) % abilities.length];
}

/** Setzt der Boss in dieser Runde eine Fähigkeit ein – und welche? */
export function bossAbilityDue(creatureId: string, round: number): BossAbilityDef | null {
  return abilityForRound(getBossAbilities(creatureId), round);
}

/** In wie vielen Runden kommt die nächste Boss-Fähigkeit (0 = diese Runde)? null ohne Fähigkeit. */
export function roundsUntilBossAbility(creatureId: string, round: number): number | null {
  const ability = getBossAbility(creatureId);
  if (!ability) return null;
  return (ability.every - (round % ability.every)) % ability.every;
}

/** Die nächste Fähigkeit, die der Boss ab Runde `round` einsetzt (diese Runde eingeschlossen) – für die Ankündigung. */
export function upcomingBossAbility(creatureId: string, round: number): BossAbilityDef | null {
  const wait = roundsUntilBossAbility(creatureId, round);
  return wait === null ? null : bossAbilityDue(creatureId, round + wait);
}
