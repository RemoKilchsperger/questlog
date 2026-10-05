// Boss-Fähigkeiten: Jeder Gebietsboss setzt alle paar Runden eine besondere
// Attacke ein – statt seines normalen Angriffs. Sie wird eine Runde vorher
// angekündigt, damit man reagieren kann: Bollwerk (Schild) blockt sie komplett,
// ein Betäubender Schlag (Streitkolben) verhindert sie.

export interface BossAbilityDef {
  bossId: string;
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
  /** Heilt den Boss um diesen Anteil des verursachten Schadens */
  drain?: number;
  /** Raubt dem Helden so viel Mana */
  manaBurn?: number;
}

export const BOSS_ABILITIES: readonly BossAbilityDef[] = [
  {
    bossId: "goblin-chief",
    name: "Rasender Hieb",
    icon: "🪓",
    description: "Drei wilde Hiebe hintereinander.",
    every: 3,
    multiplier: 0.6,
    hits: 3,
  },
  {
    bossId: "ancient-lizard",
    name: "Giftbiss",
    icon: "🐍",
    description: "Ein Biss, der den Helden 3 Runden lang vergiftet.",
    every: 3,
    multiplier: 1,
    poison: { percent: 0.3, rounds: 3 },
  },
  {
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
    bossId: "primal-mammoth",
    name: "Erdstampfer",
    icon: "🦣",
    description: "Ein gewaltiges Stampfen mit 2,5-fachem Schaden.",
    every: 4,
    multiplier: 2.5,
  },
  {
    bossId: "lich-king",
    name: "Lebensentzug",
    icon: "💀",
    description: "Saugt Leben aus dem Helden und heilt sich um den vollen Schaden.",
    every: 3,
    multiplier: 1.3,
    drain: 1,
  },
  {
    bossId: "ignaroth",
    name: "Feueratem",
    icon: "🔥",
    description: "Ein Flammenstoss, der Rüstung ignoriert und 2 Runden nachbrennt.",
    every: 3,
    multiplier: 1.6,
    ignoreArmor: true,
    poison: { percent: 0.25, rounds: 2 },
  },

  // Dungeon-Bosse
  {
    bossId: "ore-king",
    name: "Erzlawine",
    icon: "🪨",
    description: "Lässt Gestein herabstürzen: doppelter Schaden, der Rüstung ignoriert.",
    every: 3,
    multiplier: 2,
    ignoreArmor: true,
  },
  {
    bossId: "high-priestess",
    name: "Fluch der Mumie",
    icon: "𓂀",
    description: "Ein Fluch, der 25 Mana raubt und 4 Runden lang Lebenskraft zehrt.",
    every: 3,
    multiplier: 0.8,
    manaBurn: 25,
    poison: { percent: 0.3, rounds: 4 },
  },
  {
    bossId: "storm-lord",
    name: "Kettenblitz",
    icon: "⚡",
    description: "Drei Blitze hintereinander, die Rüstung ignorieren.",
    every: 3,
    multiplier: 0.75,
    hits: 3,
    ignoreArmor: true,
  },
  {
    bossId: "void-lord",
    name: "Leerenschlund",
    icon: "🌀",
    description: "Verschlingt Lebenskraft und Mana: 1,6-facher Schaden, heilt sich voll darum, raubt 25 Mana.",
    every: 3,
    multiplier: 1.6,
    drain: 1,
    manaBurn: 25,
  },
];

export function getBossAbility(creatureId: string): BossAbilityDef | null {
  return BOSS_ABILITIES.find((a) => a.bossId === creatureId) ?? null;
}

/** Setzt der Boss seine Fähigkeit in dieser Runde ein? */
export function bossAbilityDue(creatureId: string, round: number): BossAbilityDef | null {
  const ability = getBossAbility(creatureId);
  return ability && round % ability.every === 0 ? ability : null;
}

/** In wie vielen Runden kommt die Boss-Fähigkeit (0 = diese Runde)? null ohne Fähigkeit. */
export function roundsUntilBossAbility(creatureId: string, round: number): number | null {
  const ability = getBossAbility(creatureId);
  if (!ability) return null;
  return (ability.every - (round % ability.every)) % ability.every;
}
