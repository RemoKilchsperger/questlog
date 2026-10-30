// Boss-Mechaniken, gemeinsam für Solo- und Koop-Kampf:
//
// Phasen: Fällt ein Boss unter einen Anteil seiner Lebenspunkte (meist die
// Hälfte), ändert sich der Kampf – einmal pro Kampf. Er gerät in Raserei (mehr
// Schaden bis zum Ende) und/oder ruft Verstärkung: Der gewöhnliche Begleiter
// steht mit vollen Lebenspunkten (wieder) da. Ausgelöst wird die Phase nach der
// Heldenphase (samt Gift, Feuer, Bluten) – sie wirkt also schon auf den
// Gegenangriff derselben Runde.
//
// Rollen der Begleiter: Einer der beiden Begleiter jedes Bosses hat eine
// Aufgabe. Solange er steht, hilft er dem Boss – es lohnt sich, ihn zuerst
// auszuschalten. Er kommt auch beim Sammelruf nicht zurück, sonst lohnte es
// sich nicht (Simulation: dann war es am besten, die Begleiter zu ignorieren).
//   - Heiler: heilt den Boss jede Runde, statt selbst anzugreifen
//   - Schildträger: der Boss erleidet weniger Schaden
//   - Trommler: der Boss macht mehr Schaden
//
// Stärke per Simulation abgestimmt (docs/boss-mechaniken.md): Schwächere Heiler
// (4 %) und Trommler (+25 %) lohnten sich in kurzen Dungeon-Kämpfen nicht – es
// war besser, sie zu ignorieren.

export type AddRole = "healer" | "shield" | "drummer";

/** Der Heiler heilt den Boss jede Runde um diesen Anteil seiner maximalen Lebenspunkte. */
export const HEALER_HEAL = 0.07;
/** Solange ein Schildträger steht, erleidet der Boss nur noch diesen Anteil des Schadens. */
export const SHIELD_DAMAGE_TAKEN = 0.5;
/** Solange ein Trommler steht, macht der Boss so viel mehr Schaden. */
export const DRUMMER_BONUS = 0.4;

export interface AddRoleDef {
  name: string;
  icon: string;
  description: string;
}

export const ADD_ROLES: Record<AddRole, AddRoleDef> = {
  healer: {
    name: "Heiler",
    icon: "💚",
    description: `Heilt den Boss jede Runde um ${HEALER_HEAL * 100} % seiner Lebenspunkte, statt anzugreifen.`,
  },
  shield: {
    name: "Schildträger",
    icon: "🛡️",
    description: `Schützt den Boss: Solange er steht, erleidet der Boss nur ${SHIELD_DAMAGE_TAKEN * 100} % des Schadens.`,
  },
  drummer: {
    name: "Trommler",
    icon: "🥁",
    description: `Feuert den Boss an: Solange er steht, macht der Boss ${DRUMMER_BONUS * 100} % mehr Schaden.`,
  },
};

/** Ein Begleiter, soweit es für seine Rolle zählt: lebt er noch? */
interface RoleHolder {
  role?: AddRole;
  hp: number;
}

const active = (adds: readonly RoleHolder[], role: AddRole) => adds.some((a) => a.role === role && a.hp > 0);

/** Faktor auf den Schaden, den der Boss erleidet – kleiner, solange ein Schildträger steht. */
export function bossDamageTakenFactor(adds: readonly RoleHolder[]): number {
  return active(adds, "shield") ? SHIELD_DAMAGE_TAKEN : 1;
}

/** Faktor auf den Schaden des Bosses – grösser, solange ein Trommler steht. */
export function bossDamageDealtFactor(adds: readonly RoleHolder[]): number {
  return active(adds, "drummer") ? 1 + DRUMMER_BONUS : 1;
}

export interface BossPhaseDef {
  bossId: string;
  /** Ausgelöst, sobald der Boss unter diesen Anteil seiner Lebenspunkte fällt */
  at: number;
  name: string;
  icon: string;
  description: string;
  /** Raserei: so viel mehr Schaden bis zum Ende des Kampfes */
  enrage?: number;
  /** Sammelruf: Begleiter ohne Rolle stehen mit vollen Lebenspunkten (wieder) da – die mit Rolle nicht */
  rally?: boolean;
}

export const BOSS_PHASES: readonly BossPhaseDef[] = [
  {
    bossId: "goblin-chief",
    at: 0.5,
    name: "Kriegsruf",
    icon: "📣",
    description: "Ruft Verstärkung: Der Goblin-Plünderer steht mit vollen Lebenspunkten wieder auf – der Trommler nicht.",
    rally: true,
  },
  {
    bossId: "ancient-lizard",
    at: 0.5,
    name: "Urinstinkt",
    icon: "🦎",
    description: "Gerät in Raserei: 30 % mehr Schaden bis zum Ende des Kampfes.",
    enrage: 0.3,
  },
  {
    bossId: "cave-eye",
    at: 0.5,
    name: "Weit aufgerissen",
    icon: "👁️",
    description: "Das Auge reisst sich auf: 30 % mehr Schaden bis zum Ende des Kampfes.",
    enrage: 0.3,
  },
  {
    bossId: "primal-mammoth",
    at: 0.5,
    name: "Herdenruf",
    icon: "📯",
    description: "Ruft das Rudel: Der Schneewolf kehrt mit vollen Lebenspunkten zurück – der Frosttroll nicht.",
    rally: true,
  },
  {
    bossId: "lich-king",
    at: 0.5,
    name: "Totenerweckung",
    icon: "⚰️",
    description: "Erweckt seine Diener: Der Skelettkrieger steht mit vollen Lebenspunkten wieder auf – der Hexer nicht.",
    rally: true,
  },
  {
    bossId: "ignaroth",
    at: 0.5,
    name: "Glühende Wut",
    icon: "🌋",
    description: "Gerät in Raserei: 30 % mehr Schaden bis zum Ende des Kampfes.",
    enrage: 0.3,
  },
  {
    bossId: "ore-king",
    at: 0.5,
    name: "Alarm!",
    icon: "🔔",
    description: "Schlägt Alarm: Der Kobold-Sprengmeister kehrt mit vollen Lebenspunkten zurück – der Trommler nicht.",
    rally: true,
  },
  {
    bossId: "high-priestess",
    at: 0.5,
    name: "Ewiges Leben",
    icon: "🪲",
    description: "Ruft aus dem Jenseits: Der kämpfende Kobra-Priester steht mit vollen Lebenspunkten wieder auf – der heilende nicht.",
    rally: true,
  },
  {
    bossId: "storm-lord",
    at: 0.5,
    name: "Auge des Sturms",
    icon: "🌪️",
    description: "Der Sturm entfesselt sich: 30 % mehr Schaden bis zum Ende des Kampfes.",
    enrage: 0.3,
  },
  {
    bossId: "void-lord",
    at: 0.5,
    name: "Leerenriss",
    icon: "🕳️",
    description: "Reisst die Leere auf: 20 % mehr Schaden, der Leerenkriecher kehrt mit vollen Lebenspunkten zurück – der Seelenfresser nicht.",
    enrage: 0.2,
    rally: true,
  },
];

export function getBossPhase(bossId: string): BossPhaseDef | null {
  return BOSS_PHASES.find((p) => p.bossId === bossId) ?? null;
}

/** Fällt der Boss in dieser Runde in seine zweite Phase? Nur einmal pro Kampf und solange er lebt. */
export function phaseDue(bossId: string, reached: boolean | undefined, boss: { hp: number; maxHp: number }): BossPhaseDef | null {
  const phase = getBossPhase(bossId);
  if (!phase || reached || boss.hp <= 0 || boss.hp >= boss.maxHp * phase.at) return null;
  return phase;
}
