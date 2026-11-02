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
// Aufgabe. Er kommt auch beim Sammelruf nicht zurück, sonst lohnte es sich nicht,
// ihn auszuschalten (Simulation: dann war es am besten, die Begleiter zu ignorieren).
//
// Die Begleiter mit Aufgabe setzen Fähigkeiten ein, die man kommen sieht und
// kontern kann (docs/boss-absichten.md) – solo wie im Koop. Wie man sie kontert,
// verraten die Beschreibungen nicht – das soll man im Kampf herausfinden.
//   - Heiler: Heilritual über mehrere Runden – jeder Treffer oder eine Betäubung unterbricht es
//   - Schildträger: hebt regelmässig einen Schild über den Boss, der Schaden schluckt (Gift, Feuer und Bluten gehen durch)
//   - Trommler: trommelt jede Runde lauter – der Boss macht mehr Schaden, eine Betäubung bringt ihn aus dem Takt

/** Heiler: Das Heilritual dauert so viele Runden – in der letzten heilt er. */
export const RITUAL_ROUNDS = 3;
/** Heiler: Das vollendete Ritual heilt diesen Anteil der maximalen Lebenspunkte des Bosses. */
export const RITUAL_HEAL = 0.2;
/** Schildträger: In jeder so vielten Runde hebt er den Schild, statt anzugreifen. */
export const SHIELD_EVERY = 3;
/** Schildträger: Der Schild schluckt diesen Anteil der maximalen Lebenspunkte des Bosses. */
export const SHIELD_SHARE = 0.15;
/** Trommler: höchstens so viele Trommelwirbel … */
export const DRUM_MAX = 5;
/** … je so viel mehr Schaden für den Boss. */
export const DRUM_BONUS = 0.08;

export type AddRole = "healer" | "shield" | "drummer";

export interface AddRoleDef {
  name: string;
  icon: string;
  description: string;
}

export const ADD_SKILLS: Record<AddRole, AddRoleDef> = {
  healer: {
    name: "Heiler",
    icon: "💚",
    description: `Heilritual: Nach ${RITUAL_ROUNDS} Runden heilt er den Boss um ${RITUAL_HEAL * 100} %.`,
  },
  shield: {
    name: "Schildträger",
    icon: "🛡️",
    description: `Hebt alle ${SHIELD_EVERY} Runden einen Schild über den Boss, der ${SHIELD_SHARE * 100} % seiner Lebenspunkte an Schaden schluckt.`,
  },
  drummer: {
    name: "Trommler",
    icon: "🥁",
    description: `Trommelt jede Runde lauter: +${DRUM_BONUS * 100} % Boss-Schaden pro Wirbel, bis zu ${DRUM_MAX}.`,
  },
};

/** Was der Begleiter mit Aufgabe gerade vorhat – `cast` ist sein Fortschritt (BattleAdd.cast). */
export function addIntentText(role: AddRole, cast = 0): { text: string; urgent: boolean } {
  if (role === "healer") {
    const left = RITUAL_ROUNDS - cast;
    return left <= 1
      ? { text: `Heilt den Boss diese Runde um ${RITUAL_HEAL * 100} %!`, urgent: true }
      : { text: `Heilritual: Heilung in ${left} Runden`, urgent: false };
  }
  if (role === "shield") {
    const left = SHIELD_EVERY - cast;
    return left <= 1 ? { text: "Hebt diese Runde den Schild!", urgent: true } : { text: `Schild in ${left} Runden`, urgent: false };
  }
  if (cast === 0) return { text: "Hebt die Trommelstöcke …", urgent: false };
  return { text: `Trommelwirbel ×${cast} (+${Math.round(cast * DRUM_BONUS * 100)} % Boss-Schaden)`, urgent: cast >= 3 };
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
