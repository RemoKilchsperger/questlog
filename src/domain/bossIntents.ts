// Absichten der Bosse (Solo-Kampf): Jede Runde zeigt der Boss vor der Aktion
// des Helden, was er vorhat – zuschlagen, eine Fähigkeit einsetzen, aufladen …
// Darauf antwortet der Held: voll angreifen, abwehren, unterbrechen oder das
// Ziel wechseln (docs/boss-absichten.md).
//
// Die meisten Bosse folgen noch dem alten Takt: alle `every` Runden ihre
// Fähigkeit (bossAbilities.ts), sonst ein normaler Angriff. Einige haben einen
// eigenen Ablauf (`SCRIPTS`), der auf den Kampf reagiert:
//   - Krummzahn: Jeder Treffer macht ihn wütender, volle Wut = Wutanfall
//   - Höhlenauge: offen wirft es Fähigkeiten zurück, geschlossen ist es verwundbar
//   - Urmammut: lädt einen Ansturm auf – genug Schaden oder eine Betäubung bricht ihn ab
//   - Sumpfechse: taucht ab (nicht angreifbar), dann Hinterhalt mit Gift
//   - Lichkönig: Seelengefäss – er steht einmal wieder auf, fallende Skelette laden es auf
//   - Ignaroth: hebt ab – in der Luft treffen nur Bogen, Stab und Zepter voll, beim Landen Feueratem
//   - Erzkönig: Panzerplatten – jeder Treffer bricht eine ab, ohne Platten ist er verwundbar
//   - Neferet: Fluch, der herunterzählt – genug Schaden an ihr oder Läuterung bricht ihn
//   - Kaelthar: lädt sich mit jeder Fähigkeit des Helden auf und entlädt sich
//   - Xal'Zar: verschlingt die stärkste Fähigkeit und schlägt damit zu, bis man ihm genug Schaden macht
// Die Dungeon-Bosse setzen ihre beiden Fähigkeiten weiter im festen Takt ein –
// ihr Ablauf kommt dazu. Im Koop-Kampf (coopCombat.ts) gilt dasselbe für die Dungeon-Bosse:
// Neferets Fluch liegt dort auf einem Helden und springt beim Ausbruch über, Kaelthar
// braucht mehr Ladungen, Xal'Zar verschlingt die Fähigkeit eines Helden.

import { bossAbilityDue, getBossAbilities, getBossAbilityById, type BossAbilityDef } from "./bossAbilities";

export type BossIntentId =
  /** Normaler Angriff */
  | "attack"
  /** Eine Fähigkeit aus bossAbilities.ts (`ability`) */
  | "ability"
  /** Lädt einen grossen Angriff auf – greift diese Runde nicht an */
  | "charging"
  /** Taumelt nach einem abgebrochenen Aufladen – greift nicht an und erleidet mehr Schaden */
  | "staggered"
  /** Sumpfechse: abgetaucht – greift nicht an und ist nicht angreifbar */
  | "submerged"
  /** Xal'Zar: verschlingt die stärkste Fähigkeit des Helden – greift nicht an */
  | "devour"
  /** Xal'Zar: schlägt mit der verschlungenen Fähigkeit zu */
  | "stolen";

/** Zustand des Bosses für die laufende Runde – gespeichert im Kampf (BattleState.bossTurn). */
export interface BossTurn {
  intent: BossIntentId;
  /** Bei "ability": welche Fähigkeit */
  ability?: string;
  /** Schritt im Ablauf des Bosses (Höhlenauge: Lidschlag, Urmammut: Angriffe bis zum Aufladen) */
  step?: number;
  /** Krummzahn: aufgestaute Wut */
  rage?: number;
  /** Höhlenauge: offen (wirft Fähigkeiten zurück) oder geschlossen (verwundbar) */
  eye?: "open" | "closed";
  /** Urmammut: Aufladen – bisher erlittener Schaden und Runden bis zum Ansturm (inkl. dieser) */
  charge?: { taken: number; roundsLeft: number };
  /** Ignaroth: in der Luft */
  airborne?: boolean;
  /** Lichkönig: Ladungen des Seelengefässes – 0, wenn es zerbrochen ist */
  vessel?: number;
  /** Erzkönig: verbliebene Panzerplatten … */
  plates?: number;
  /** … im Koop so viele, wenn sie nachwachsen (sonst PLATES_MAX) */
  platesMax?: number;
  /** … und ohne Platten: so viele Runden (inkl. dieser), bis sie nachwachsen */
  exposed?: number;
  /** Neferet: Fluch auf dem Helden – Runden bis er losbricht (inkl. dieser); gebrochen, sobald sie höchstens `breakAt` LP hat */
  curse?: { roundsLeft: number; breakAt: number; heroId?: string };
  /** Kaelthar: aufgestaute Ladungen */
  static?: number;
  /** Kaelthar im Koop: so viele Ladungen braucht er (sonst STATIC_MAX) */
  staticMax?: number;
  /** Xal'Zar: verschlungene Fähigkeit des Helden und der Schaden, den er seitdem erlitten hat */
  devoured?: { ability: string; taken: number; heroId?: string };
  /** Xal'Zar: Runden, bis er (wieder) eine Fähigkeit verschlingt */
  hunger?: number;
}

/** Was in einer Runde passiert ist – daraus ergibt sich der nächste Zug. */
export interface RoundFacts {
  /** Die nächste Runde */
  round: number;
  /** Direkte Treffer des Helden auf den Boss */
  heroHits: number;
  /** Lebenspunkte, die der Boss in dieser Runde verloren hat */
  damageTaken: number;
  bossMaxHp: number;
  /** Die Betäubung hat den Boss erwischt (nicht nur versucht) */
  stunned: boolean;
  /** Lebenspunkte des Bosses am Ende der Runde */
  bossHp?: number;
  /** Der Held hat eine Fähigkeit eingesetzt */
  heroAbility?: boolean;
  /** Koop: so viele Fähigkeiten hat die Gruppe eingesetzt (statt `heroAbility`) */
  abilitiesUsed?: number;
  /** Koop: so viele Ladungen braucht Kaelthar */
  staticMax?: number;
  /** Koop: Auf diesem Helden liegt der neue Fluch … */
  cursedHero?: string;
  /** … bzw. er ist losgebrochen und springt auf diesen über */
  curseJumpTo?: string;
  /** Koop: Xal'Zar hat die Fähigkeit dieses Helden verschlungen */
  devouredFrom?: string;
  /** Gewöhnliche Begleiter (ohne Aufgabe), die in dieser Runde gefallen sind */
  addsDown?: number;
  /** Der Boss ist in dieser Runde wieder aufgestanden (Seelengefäss) */
  risen?: boolean;
  /** Diese Boss-Fähigkeit hat den Helden erreicht (nicht geblockt) */
  abilityLanded?: string;
  /** Der Fluch auf dem Helden ist gebrochen (Schaden oder Läuterung) */
  curseBroken?: boolean;
  /** Erzkönig: verbliebene Panzerplatten nach den Treffern dieser Runde */
  platesLeft?: number;
  /** Xal'Zar: Diese Fähigkeit hat er in dieser Runde verschlungen */
  devoured?: string;
}

interface BossScript {
  first(): BossTurn;
  next(turn: BossTurn, facts: RoundFacts): BossTurn;
}

/** Krummzahn: Ab so viel Wut kommt der Wutanfall. */
export const RAGE_MAX = 4;
/** Höhlenauge: so viele Runden offen, dann so viele geschlossen. */
export const EYE_OPEN_ROUNDS = 2;
export const EYE_CLOSED_ROUNDS = 2;
/** Höhlenauge: geschlossen erleidet es so viel mehr Schaden. */
export const EYE_CLOSED_TAKEN = 0.25;
/** Höhlenauge: Diesen Anteil einer zurückgeworfenen Fähigkeit erleidet der Held. */
export const EYE_REFLECT = 1;
/** Urmammut: so viele normale Angriffe, dann lädt er auf. */
export const CHARGE_AFTER = 3;
/** Urmammut: so viele Runden lädt er auf. */
export const CHARGE_ROUNDS = 1;
/** Urmammut: Wer ihm beim Aufladen so viel seiner Lebenspunkte nimmt, bricht den Ansturm ab. */
export const CHARGE_BREAK = 0.3;
/** Taumelnd erleidet der Boss so viel mehr Schaden. */
export const STAGGER_TAKEN = 0.3;
/** Sumpfechse: so viele normale Angriffe, dann taucht sie ab – eine Runde später der Hinterhalt. */
export const DIVE_AFTER = 2;
/** Lichkönig: Ladungen des Seelengefässes zu Beginn und höchstens. */
export const VESSEL_START = 0;
export const VESSEL_MAX = 3;
/** Lichkönig: Er steht mit diesem Anteil seiner LP pro Ladung wieder auf. */
export const VESSEL_HP = 0.12;
/** Ignaroth: Runden am Boden, dann in der Luft – danach landet er mit dem Feueratem. */
export const GROUND_ROUNDS = 2;
export const FLIGHT_ROUNDS = 2;
/** Ignaroth: In der Luft macht der Nahkampf nur diesen Anteil des Schadens. */
export const AIRBORNE_MELEE = 0.5;
/** Waffen, die einen Gegner in der Luft voll treffen. */
export const RANGED_WEAPONS: readonly string[] = ["bow", "staff", "scepter"];
/** Erzkönig: so viele Panzerplatten … */
export const PLATES_MAX = 3;
/** … mit Platten erleidet er nur diesen Anteil des Schadens … */
export const PLATE_TAKEN = 0.6;
/** … ohne Platten so viel mehr, so viele Runden lang – dann wachsen sie nach. */
export const EXPOSED_TAKEN = 0.3;
export const EXPOSED_ROUNDS = 2;
/** Neferet: Der Fluch bricht nach so vielen Runden los … */
export const CURSE_ROUNDS = 2;
/** … ausser der Held nimmt ihr bis dahin so viel ihrer LP … */
export const CURSE_BREAK = 0.15;
/** … sonst trifft er mit diesem Anteil der LP des Helden (Rüstung hilft nicht). */
export const CURSE_DAMAGE = 0.25;
/** Kaelthar: Bei so vielen Ladungen entlädt er sich – im Koop braucht er so viele pro Held. */
export const STATIC_MAX = 3;
export const COOP_STATIC_PER_HERO = 4;
/** Xal'Zar: verschlingt in Runde 2 und dann so viele Runden nach jeder Befreiung. */
export const DEVOUR_AGAIN = 3;
/** Xal'Zar: Wer ihm so viel seiner LP nimmt, befreit die Fähigkeit. */
export const DEVOUR_FREE = 0.2;
/** Xal'Zar: Die verschlungene Fähigkeit trifft mit diesem Anteil ihrer Wucht – mindestens wie ein normaler Angriff. */
export const STOLEN_SHARE = 0.7;

const SCRIPTS: Readonly<Record<string, BossScript>> = {
  "goblin-chief": {
    first: () => ({ intent: "attack", rage: 0 }),
    next(turn, facts) {
      // Der Wutanfall leert die Wut – Treffer in seiner Runde zählen schon für den nächsten
      const rage = (turn.rage ?? 0) + facts.heroHits;
      if (turn.intent !== "ability" && rage >= RAGE_MAX) return { intent: "ability", ability: "goblin-chief", rage: 0 };
      return { intent: "attack", rage };
    },
  },
  "cave-eye": {
    // Schritt 0 und 1: offen (beim Öffnen der Lähmende Blick), 2 und 3: geschlossen
    first: () => eyeTurn(0),
    next: (turn) => eyeTurn(((turn.step ?? 0) + 1) % (EYE_OPEN_ROUNDS + EYE_CLOSED_ROUNDS)),
  },
  "primal-mammoth": {
    first: () => ({ intent: "attack", step: 0 }),
    next(turn, facts) {
      if (turn.intent === "charging" && turn.charge) {
        const taken = turn.charge.taken + facts.damageTaken;
        if (facts.stunned || taken >= facts.bossMaxHp * CHARGE_BREAK) return { intent: "staggered", step: 0 };
        if (turn.charge.roundsLeft > 1) return { intent: "charging", charge: { taken, roundsLeft: turn.charge.roundsLeft - 1 } };
        return { intent: "ability", ability: "primal-mammoth" };
      }
      if (turn.intent === "ability" || turn.intent === "staggered") return { intent: "attack", step: 0 };
      const step = (turn.step ?? 0) + 1;
      return step >= CHARGE_AFTER ? { intent: "charging", charge: { taken: 0, roundsLeft: CHARGE_ROUNDS } } : { intent: "attack", step };
    },
  },
  "ancient-lizard": {
    // Zwei Angriffe, abtauchen, Hinterhalt – dann von vorn
    first: () => ({ intent: "attack", step: 0 }),
    next(turn) {
      const step = ((turn.step ?? 0) + 1) % (DIVE_AFTER + 2);
      if (step === DIVE_AFTER) return { intent: "submerged", step };
      if (step === DIVE_AFTER + 1) return { intent: "ability", ability: "ancient-lizard", step };
      return { intent: "attack", step };
    },
  },
  "lich-king": {
    first: () => ({ intent: "attack", vessel: VESSEL_START }),
    next(turn, facts) {
      // Ist er aufgestanden, ist das Gefäss zerbrochen – sonst laden es fallende Skelette auf
      const vessel = facts.risen ? 0 : Math.min(VESSEL_MAX, (turn.vessel ?? 0) + (facts.addsDown ?? 0));
      return { ...cadenceTurn("lich-king", facts.round), vessel };
    },
  },
  ignaroth: {
    // Schritt 0 und 1 am Boden, 2 und 3 in der Luft, 4: landet mit dem Feueratem
    first: () => ({ intent: "attack", step: 0 }),
    next(turn) {
      const step = ((turn.step ?? 0) + 1) % (GROUND_ROUNDS + FLIGHT_ROUNDS + 1);
      if (step === GROUND_ROUNDS + FLIGHT_ROUNDS) return { intent: "ability", ability: "ignaroth", step };
      return step >= GROUND_ROUNDS ? { intent: "attack", step, airborne: true } : { intent: "attack", step };
    },
  },
  "ore-king": {
    first: () => ({ intent: "attack", plates: PLATES_MAX }),
    next(turn, facts) {
      const base = { ...cadenceTurn("ore-king", facts.round), ...(turn.platesMax && { platesMax: turn.platesMax }) };
      const left = facts.platesLeft ?? turn.plates ?? 0;
      if (left > 0) return { ...base, plates: left };
      // Gerade gefallen: ein paar Runden verwundbar – danach wachsen die Platten nach
      if ((turn.plates ?? 0) > 0) return { ...base, plates: 0, exposed: EXPOSED_ROUNDS };
      if ((turn.exposed ?? 0) > 1) return { ...base, plates: 0, exposed: turn.exposed! - 1 };
      return { ...base, plates: turn.platesMax ?? PLATES_MAX };
    },
  },
  "high-priestess": {
    first: () => ({ intent: "attack" }),
    next(turn, facts) {
      const base = cadenceTurn("high-priestess", facts.round);
      const fresh = (heroId: string | undefined): BossTurn => ({
        ...base,
        curse: { roundsLeft: CURSE_ROUNDS, breakAt: Math.round((facts.bossHp ?? 0) - facts.bossMaxHp * CURSE_BREAK), ...(heroId && { heroId }) },
      });
      // Der Fluch der Mumie legt den Fluch – im Koop springt er beim Ausbruch über
      if (facts.abilityLanded === "high-priestess") return fresh(facts.cursedHero);
      if (facts.curseJumpTo) return fresh(facts.curseJumpTo);
      // Gebrochen ist er weg, sonst zählt er herunter
      if (turn.curse && !facts.curseBroken && turn.curse.roundsLeft > 1) return { ...base, curse: { ...turn.curse, roundsLeft: turn.curse.roundsLeft - 1 } };
      return base;
    },
  },
  "storm-lord": {
    first: () => ({ intent: "attack", static: 0 }),
    next(turn, facts) {
      const max = facts.staticMax ?? STATIC_MAX;
      const coop = facts.staticMax !== undefined ? { staticMax: max } : {};
      if (turn.ability === "storm-lord-discharge") return { ...cadenceTurn("storm-lord", facts.round), static: 0, ...coop };
      const charges = (turn.static ?? 0) + (facts.abilitiesUsed ?? (facts.heroAbility ? 1 : 0));
      if (charges >= max) return { intent: "ability", ability: "storm-lord-discharge", static: charges, ...coop };
      return { ...cadenceTurn("storm-lord", facts.round), static: charges, ...coop };
    },
  },
  "void-lord": {
    first: () => ({ intent: "attack", hunger: 1 }),
    next(turn, facts) {
      const base = cadenceTurn("void-lord", facts.round);
      if (turn.intent === "devour") {
        if (!facts.devoured) return { ...base, hunger: DEVOUR_AGAIN };
        return { ...stolenOr(base), devoured: { ability: facts.devoured, taken: 0, ...(facts.devouredFrom && { heroId: facts.devouredFrom }) } };
      }
      if (turn.devoured) {
        const taken = turn.devoured.taken + facts.damageTaken;
        // Genug Schaden befreit die Fähigkeit
        if (taken >= facts.bossMaxHp * DEVOUR_FREE) return { ...base, hunger: DEVOUR_AGAIN };
        return { ...stolenOr(base), devoured: { ...turn.devoured, taken } };
      }
      const hunger = (turn.hunger ?? 0) - 1;
      // Eine fällige Fähigkeit geht vor – dann verschlingt er in der Runde danach
      if (hunger <= 0 && base.intent !== "ability") return { intent: "devour" };
      return { ...base, hunger: Math.max(hunger, 1) };
    },
  },
};

/** Xal'Zar mit einer verschlungenen Fähigkeit: Statt normal anzugreifen, schlägt er damit zu. */
const stolenOr = (base: BossTurn): BossTurn => (base.intent === "attack" ? { intent: "stolen" } : base);

function eyeTurn(step: number): BossTurn {
  const eye = step < EYE_OPEN_ROUNDS ? "open" : "closed";
  return step === 0 ? { intent: "ability", ability: "cave-eye", step, eye } : { intent: "attack", step, eye };
}

/** Hat der Boss einen eigenen Ablauf (statt des festen Takts)? */
export function hasBossScript(creatureId: string): boolean {
  return creatureId in SCRIPTS;
}

/** Fester Takt: alle `every` Runden die Fähigkeit, sonst ein normaler Angriff. */
function cadenceTurn(creatureId: string, round: number): BossTurn {
  const ability = bossAbilityDue(creatureId, round);
  return ability ? { intent: "ability", ability: ability.id } : { intent: "attack" };
}

/**
 * Zug zu Kampfbeginn – null für Gegner ohne Absichten (normale Kreaturen). Mit
 * `round` für ältere Kämpfe, die noch keinen Zug gespeichert haben.
 */
export function firstBossTurn(creatureId: string, round = 1): BossTurn | null {
  const script = SCRIPTS[creatureId];
  if (script) return script.first();
  return getBossAbilities(creatureId).length > 0 ? cadenceTurn(creatureId, round) : null;
}

/** Zug der nächsten Runde nach dieser. */
export function nextBossTurn(creatureId: string, turn: BossTurn, facts: RoundFacts): BossTurn {
  const script = SCRIPTS[creatureId];
  return script ? script.next(turn, facts) : cadenceTurn(creatureId, facts.round);
}

/** Die Fähigkeit, die der Boss in dieser Runde einsetzt – oder null. */
export function turnAbility(turn: BossTurn | null | undefined): BossAbilityDef | null {
  return turn?.intent === "ability" && turn.ability ? getBossAbilityById(turn.ability) : null;
}

/** Greift der Boss in dieser Runde an? Beim Aufladen, Taumeln, Abtauchen und Verschlingen nicht. */
export function bossAttacks(turn: BossTurn | null | undefined): boolean {
  return turn?.intent !== "charging" && turn?.intent !== "staggered" && turn?.intent !== "submerged" && turn?.intent !== "devour";
}

/** Faktor auf den Schaden, den der Boss in dieser Runde erleidet. */
export function bossTurnTakenFactor(turn: BossTurn | null | undefined): number {
  if (turn?.intent === "staggered") return 1 + STAGGER_TAKEN;
  if (turn?.eye === "closed") return 1 + EYE_CLOSED_TAKEN;
  return 1;
}

/** Erzkönig: Faktor auf einen direkten Treffer – mit Platten weniger, ohne mehr. 1 bei Bossen ohne Platten. */
export function plateFactor(plates: number | undefined): number {
  if (plates === undefined) return 1;
  return plates > 0 ? PLATE_TAKEN : 1 + EXPOSED_TAKEN;
}

/** Ignaroth in der Luft: Faktor auf einen direkten Treffer mit dieser Waffe. */
export function airborneFactor(turn: BossTurn | null | undefined, weapon: string | null | undefined): number {
  return turn?.airborne && !(weapon && RANGED_WEAPONS.includes(weapon)) ? AIRBORNE_MELEE : 1;
}

/** Ist der Boss in dieser Runde nicht angreifbar (abgetaucht)? */
export function untouchable(turn: BossTurn | null | undefined): boolean {
  return turn?.intent === "submerged";
}

/** Xal'Zar: Wucht der verschlungenen Fähigkeit – Faktor pro Treffer und Zahl der Treffer. */
export function stolenStrike(ability: { multiplier: number; hits?: number }): { multiplier: number; hits: number } {
  const hits = Math.max(1, ability.hits ?? 1);
  const total = Math.max(1, ability.multiplier * hits * STOLEN_SHARE);
  return { multiplier: total / hits, hits };
}

/** Wirft der Boss in dieser Runde Fähigkeiten zurück (offenes Höhlenauge)? */
export function reflectsAbilities(turn: BossTurn | null | undefined): boolean {
  return turn?.eye === "open";
}

export interface IntentView {
  icon: string;
  title: string;
  /** Kurz und ohne Lösung – herausfinden, wann der richtige Moment ist, soll man selbst */
  text: string;
  /** danger: grosser Angriff · warn: etwas bahnt sich an · chance: eine Blösse · calm: nichts Besonderes */
  tone: "danger" | "warn" | "chance" | "calm";
}

/**
 * Die Absicht des Bosses für diese Runde – was man ihm ansieht, nicht wie man es kontert.
 * `others` (Koop): Namen der Mitspieler, auf denen der Fluch liegt bzw. deren Fähigkeit er hält –
 * fehlt ein Name, betrifft es einen selbst.
 */
export function describeIntent(creatureId: string, turn: BossTurn, others: { curse?: string; devoured?: string } = {}): IntentView {
  const ability = turnAbility(turn);
  if (creatureId === "cave-eye") {
    if (ability) return { icon: ability.icon, title: ability.name, text: `Das Auge reisst sich auf. ${ability.description}`, tone: "danger" };
    if (turn.eye === "open") return { icon: "👁️", title: "Starrt dich an", text: "Das Auge ist weit offen und folgt jeder deiner Bewegungen.", tone: "warn" };
    const opening = (turn.step ?? 0) === EYE_OPEN_ROUNDS + EYE_CLOSED_ROUNDS - 1;
    return opening
      ? { icon: "😑", title: "Das Lid zuckt …", text: "Das Auge ist noch geschlossen.", tone: "chance" }
      : { icon: "😑", title: "Geschlossen", text: "Das Auge hat sich geschlossen.", tone: "chance" };
  }
  if (turn.intent === "charging") {
    return { icon: "💨", title: "Scharrt mit den Hufen …", text: "Er senkt den Kopf und nimmt Anlauf.", tone: "warn" };
  }
  if (turn.intent === "submerged") {
    return { icon: "🫧", title: "Abgetaucht", text: "Nur noch Blasen steigen aus dem Sumpf.", tone: "warn" };
  }
  if (turn.intent === "devour") {
    return { icon: "🕳️", title: "Reisst den Schlund auf", text: "Die Leere greift nach deiner Kraft.", tone: "danger" };
  }
  if (turn.intent === "stolen") {
    return others.devoured
      ? { icon: "🕳️", title: `Schlägt mit der Kraft von ${others.devoured} zu`, text: "In der Leere flackert, was er genommen hat.", tone: "danger" }
      : { icon: "🕳️", title: "Schlägt mit deiner Kraft zu", text: "In der Leere flackert, was er dir genommen hat.", tone: "danger" };
  }
  if (turn.intent === "staggered") {
    return { icon: "💫", title: "Taumelt!", text: "Er ist aus dem Gleichgewicht geraten.", tone: "chance" };
  }
  if (ability) {
    // Bricht der Fluch in derselben Runde los, sieht man auch das
    const curse = turn.curse && turn.curse.roundsLeft <= 1 ? ` Die Zeichen auf ${others.curse ? `der Haut von ${others.curse}` : "deiner Haut"} glühen grell.` : "";
    if (creatureId === "ancient-lizard") return { icon: ability.icon, title: `${ability.name}!`, text: "Etwas bewegt sich direkt unter dir.", tone: "danger" };
    if (creatureId === "ignaroth") return { icon: ability.icon, title: `${ability.name}!`, text: "Er stürzt herab, in seinem Rachen glüht es.", tone: "danger" };
    return { icon: ability.icon, title: `${ability.name}!`, text: ability.description + curse, tone: "danger" };
  }
  const detail = calmDetail(creatureId, turn, others);
  if (detail) return detail;
  if (creatureId === "goblin-chief") {
    const rage = turn.rage ?? 0;
    if (rage >= RAGE_MAX - 1) return { icon: "😡", title: "Schäumt vor Wut", text: "Er brüllt und schlägt um sich.", tone: "warn" };
    if (rage >= RAGE_MAX / 2) return { icon: "😠", title: "Knurrt wütend", text: "Sein Gesicht läuft rot an.", tone: "calm" };
  }
  return { icon: "🗡️", title: "Schlägt zu", text: "Ein normaler Angriff.", tone: "calm" };
}

/** Zustände, die man einem angreifenden Boss ansieht – ohne Zahlen und ohne Gegenmittel. */
function calmDetail(creatureId: string, turn: BossTurn, others: { curse?: string }): IntentView | null {
  if (turn.curse) {
    const skin = others.curse ? `die Haut von ${others.curse}` : "deine Haut";
    return turn.curse.roundsLeft <= 1
      ? { icon: "𓂀", title: "Der Fluch bricht los!", text: `Die Zeichen auf ${others.curse ? `der Haut von ${others.curse}` : "deiner Haut"} glühen grell.`, tone: "danger" }
      : { icon: "𓂀", title: others.curse ? `${others.curse} ist verflucht` : "Verflucht", text: `Dunkle Zeichen kriechen über ${skin}.`, tone: "warn" };
  }
  if (turn.airborne) return { icon: "🐉", title: "Kreist über dir", text: "Er speit Feuer aus der Höhe.", tone: "warn" };
  if (creatureId === "ancient-lizard" && turn.step === DIVE_AFTER - 1) {
    return { icon: "🦎", title: "Schielt zum Wasser", text: "Sie schnappt nach dir und weicht zurück.", tone: "calm" };
  }
  if (creatureId === "ignaroth" && turn.step === GROUND_ROUNDS - 1) {
    return { icon: "🐉", title: "Spannt die Flügel", text: "Er schlägt mit den Flügeln, der Staub wirbelt.", tone: "calm" };
  }
  if (turn.plates !== undefined) {
    if (turn.plates === 0) return { icon: "💥", title: "Ungeschützt", text: "Seine Panzerplatten liegen am Boden.", tone: "chance" };
    if (turn.plates < (turn.platesMax ?? PLATES_MAX)) return { icon: "🛡️", title: "Angeschlagener Panzer", text: "Seine Rüstung hat Lücken.", tone: "calm" };
  }
  const staticMax = turn.staticMax ?? STATIC_MAX;
  if ((turn.static ?? 0) >= staticMax - 1) return { icon: "⚡", title: "Knistert vor Energie", text: "Blitze zucken über seinen Körper.", tone: "warn" };
  if ((turn.static ?? 0) >= staticMax / 2) return { icon: "⚡", title: "Funken sprühen", text: "Die Luft um ihn knistert.", tone: "calm" };
  if (creatureId === "lich-king" && (turn.vessel ?? 0) > VESSEL_START) {
    return { icon: "⚱️", title: "Das Gefäss pulsiert", text: "Seelen wirbeln um sein Gefäss.", tone: "calm" };
  }
  return null;
}
