// Wege durch die Koop-Dungeons (docs/dungeon-wege.md): An Gabelungen stimmt die Gruppe über
// die Tür ab (bei Gleichstand zählt der Host). In Schrein und Falle entscheidet jeder für sich,
// beim Händler kauft jeder mit seinem Gold, bei Rätsel und Truhe entscheidet die Mehrheit. Wer zu lange
// braucht, bekommt nach COOP_DECIDE_SECONDS eine Vorgabe – so blockiert niemand die Gruppe.
// Reine Logik auf dem Kampfzustand – der Server (src/coop/server.ts) ruft sie auf.

import {
  dungeonPath,
  hasNextStage,
  reviveHeroes,
  startDungeonFight,
  type CoopBattleState,
  type CoopDungeonRun,
  type CoopHero,
  type CoopRoom,
} from "./coopCombat";
import { getDungeon } from "./creatures";
import {
  CARE_HEAL,
  forkDoors,
  getRiddle,
  isCalm,
  isMimicChest,
  merchantOffers,
  pickRiddle,
  pickTrap,
  RIDDLE_DAMAGE,
  sectionOf,
  shrineOffer,
  stepKind,
  trapOutcome,
  type ChestChoice,
  type Door,
  type TrapChoice,
} from "./dungeonPaths";
import { BLESSING, stacks, type BlessingId } from "./tower";
import type { ArmorClass } from "./types";

/** So lange hat die Gruppe Zeit für eine Tür, einen Segen, eine Falle oder ein Rätsel. */
export const COOP_DECIDE_SECONDS = 60;

/** Wer mitentscheidet: Spieler-Ids der Anwesenden; `hostId` gibt bei Gleichstand den Ausschlag. */
export interface Deciders {
  present: readonly string[];
  hostId: string;
}

/** Steht die Gruppe zwischen zwei Schritten in einem Raum, der noch nicht erledigt ist? */
export function openRoom(state: CoopBattleState): CoopRoom | null {
  const room = state.dungeon?.room;
  return state.status === "won" && room && !room.done ? room : null;
}

/** Türen der nächsten Gabelung – null, wenn der nächste Schritt feststeht oder erst der Raum erledigt werden muss. */
export function coopDoors(state: CoopBattleState): Door[] | null {
  if (!hasNextStage(state) || openRoom(state)) return null;
  const run = state.dungeon!;
  const area = getDungeon(run.id);
  const step = run.stage + 1;
  if (stepKind(area, step) !== "fork") return null;
  return forkDoors(run.runId, step, !(run.calm ?? [false, false])[sectionOf(area, step)]);
}

/** Wartet die Gruppe auf eine Entscheidung mit Frist (Tür oder Raum)? Dann löst der Server sie zur Deadline auf. */
export function awaitsDecision(state: CoopBattleState): boolean {
  return openRoom(state) !== null || coopDoors(state) !== null;
}

/** Häufigste Stimme – bei Gleichstand die des Hosts, sonst die erste in `order`. Ohne Stimmen: `order[0]`. */
export function majority<T>(votes: Record<string, T>, order: readonly T[], hostId: string): T {
  const counts = new Map<T, number>();
  for (const vote of Object.values(votes)) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  const best = Math.max(0, ...counts.values());
  const tied = order.filter((option) => (counts.get(option) ?? 0) === best);
  const host = votes[hostId];
  return host !== undefined && tied.includes(host) ? host : tied[0];
}

const withRun = (state: CoopBattleState, run: CoopDungeonRun, extra: Partial<CoopBattleState> = {}): CoopBattleState => ({
  ...state,
  dungeon: run,
  ...extra,
});

/* ───────────── Türen ───────────── */

/** Stimme für eine Tür. Haben alle Anwesenden gewählt (oder `force` zur Deadline), geht die Gruppe hindurch. */
export function voteDoor(
  state: CoopBattleState,
  heroId: string,
  index: number,
  deciders: Deciders,
  newId: () => string,
  now: number,
): CoopBattleState {
  const doors = coopDoors(state);
  if (!doors) throw new Error("Gerade gibt es keine Tür zur Wahl.");
  if (!doors[index]) throw new Error("Diese Tür gibt es nicht.");
  const run = { ...state.dungeon!, votes: { ...state.dungeon!.votes, [heroId]: index } };
  return settleDoors(withRun(state, run), deciders, newId, now, false);
}

/** Tür entscheiden, wenn alle gewählt haben bzw. die Zeit um ist (`force`). */
export function settleDoors(state: CoopBattleState, deciders: Deciders, newId: () => string, now: number, force: boolean): CoopBattleState {
  const doors = coopDoors(state);
  if (!doors) return state;
  const votes = state.dungeon!.votes ?? {};
  if (!force && deciders.present.some((id) => votes[id] === undefined)) return state;
  const index = majority(votes, doors.map((_, i) => i), deciders.hostId);
  return enterDoor(state, doors[index], now, newId);
}

/** Durch die Tür: ein Kampf beginnt oder die Gruppe betritt einen Raum. */
function enterDoor(state: CoopBattleState, door: Door, now: number, newId: () => string): CoopBattleState {
  const prev = state.dungeon!;
  const area = getDungeon(prev.id);
  const stage = prev.stage + 1;
  const run: CoopDungeonRun = { ...prev, stage, path: [...dungeonPath(prev), door.kind] };
  delete run.votes;
  delete run.room;
  if (!isCalm(door.kind)) return startDungeonFight(state, run, newId(), now);

  // Raum ohne Kampf: höchstens einer pro Abschnitt. Gefallene stehen auf.
  const calm: [boolean, boolean] = [...(prev.calm ?? [false, false])];
  calm[sectionOf(area, stage)] = true;
  const heroes = reviveHeroes(state.heroes);
  const seed = (heroId: string) => `${run.runId}|${heroId}`;
  let seen = run.seen ?? [];
  let room: CoopRoom;
  if (door.kind === "shrine") {
    room = {
      kind: "shrine",
      done: false,
      offers: Object.fromEntries(heroes.map((h) => [h.id, shrineOffer(seed(h.id), stage, h.blessings ?? [])])),
      chosen: {},
    };
  } else if (door.kind === "merchant") {
    room = {
      kind: "merchant",
      // Beim Händler kauft jeder, solange die Gruppe abstimmt – der Raum hält niemanden auf
      done: true,
      offers: Object.fromEntries(heroes.map((h) => [h.id, merchantOffers(area, seed(h.id), stage, h.blessings ?? [])])),
      bought: {},
    };
  } else if (door.kind === "trap") {
    const trap = pickTrap(run.runId, stage, seen);
    seen = [...seen, trap.id];
    room = { kind: "trap", done: false, trapId: trap.id, outcomes: {} };
  } else if (door.kind === "chest") {
    room = { kind: "chest", done: false, votes: {} };
  } else {
    const { riddle, options } = pickRiddle(run.runId, stage, seen);
    seen = [...seen, riddle.id];
    room = { kind: "riddle", done: false, riddleId: riddle.id, options, votes: {} };
  }
  return withRun(state, { ...run, calm, seen, room }, { heroes, deadline: now + COOP_DECIDE_SECONDS * 1000 });
}

/* ───────────── Segen ───────────── */

/**
 * Segen auf einen Helden: Kraft, Ahnen, Vitalität und Präzision wirken auf seine Werte (bis zum Ende
 * des Dungeons), Rast und Vitalität heilen sofort. Die übrigen wirken im Kampf (coopCombat.ts).
 */
export function blessCoopHero(hero: CoopHero, id: BlessingId): CoopHero {
  const n = stacks(hero.blessings, id);
  const step = (per: number) => (1 + per * (n + 1)) / (1 + per * n);
  const c = { ...hero.combatant };
  if (id === "might") c.damage *= step(BLESSING.might);
  if (id === "ancestors") c.armor = Math.round(c.armor * step(BLESSING.ancestors));
  if (id === "precision") c.critChance += BLESSING.precision;
  if (id === "vitality") {
    const maxHp = Math.round(c.maxHp * step(BLESSING.vitality));
    c.hp = Math.min(maxHp, c.hp + maxHp - c.maxHp);
    c.maxHp = maxHp;
  }
  if (id === "rest") c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * BLESSING.rest));
  return { ...hero, combatant: c, blessings: [...(hero.blessings ?? []), id] };
}

/** Segen für einen Helden – „Schatzsucher“ merkt sich der Lauf für die Beute danach. */
function grantBlessing(state: CoopBattleState, run: CoopDungeonRun, heroId: string, id: BlessingId): CoopBattleState {
  const treasure =
    id === "treasure" ? { ...run.treasure, [heroId]: [...(run.treasure?.[heroId] ?? []), run.stage] } : run.treasure;
  return withRun(state, { ...run, ...(treasure && { treasure }) }, {
    heroes: state.heroes.map((h) => (h.id === heroId ? blessCoopHero(h, id) : h)),
  });
}

/* ───────────── Räume ───────────── */

function roomOf<K extends CoopRoom["kind"]>(state: CoopBattleState, kind: K): Extract<CoopRoom, { kind: K }> {
  const room = state.status === "won" ? state.dungeon?.room : undefined;
  if (!room || room.kind !== kind) throw new Error("Die Gruppe ist gerade nicht in so einem Raum.");
  return room as Extract<CoopRoom, { kind: K }>;
}

/** Schrein: Der Held wählt einen seiner Segen. Haben alle gewählt, ist der Raum erledigt. */
export function coopShrine(state: CoopBattleState, heroId: string, id: BlessingId, deciders: Deciders, now: number): CoopBattleState {
  const room = roomOf(state, "shrine");
  if (room.done || room.chosen[heroId]) throw new Error("Du hast hier schon einen Segen gewählt.");
  if (!room.offers[heroId]?.includes(id)) throw new Error("Dieser Segen steht nicht zur Wahl.");
  const next = grantBlessing(state, state.dungeon!, heroId, id);
  const chosen = { ...room.chosen, [heroId]: id };
  return settleRoom(withRun(next, { ...next.dungeon!, room: { ...room, chosen } }), deciders, now, false, Math.random, () => "");
}

/** Händler: Der Held kauft ein Angebot – Gold und Tränke bucht sein Browser, Wundversorgung und Segen wirken hier. */
export function coopBuy(state: CoopBattleState, heroId: string, index: number): CoopBattleState {
  const room = roomOf(state, "merchant");
  const offer = room.offers[heroId]?.[index];
  if (!offer) throw new Error("Dieses Angebot gibt es nicht.");
  if (room.bought[heroId]?.includes(index)) throw new Error("Das hast du schon gekauft.");
  const bought = { ...room.bought, [heroId]: [...(room.bought[heroId] ?? []), index] };
  let next = withRun(state, { ...state.dungeon!, room: { ...room, bought } });
  if (offer.kind === "care") {
    next = {
      ...next,
      heroes: next.heroes.map((h) =>
        h.id === heroId
          ? { ...h, combatant: { ...h.combatant, hp: Math.min(h.combatant.maxHp, h.combatant.hp + Math.round(h.combatant.maxHp * CARE_HEAL)) } }
          : h,
      ),
    };
  }
  if (offer.kind === "blessing") next = grantBlessing(next, next.dungeon!, heroId, offer.blessing);
  return next;
}

/** Falle: Der Held weicht aus oder steckt ein – seine Rüstung entscheidet. */
export function coopTrap(
  state: CoopBattleState,
  heroId: string,
  choice: TrapChoice,
  armorClass: ArmorClass,
  deciders: Deciders,
  rng: () => number,
  now: number,
): CoopBattleState {
  const room = roomOf(state, "trap");
  if (room.done || room.outcomes[heroId]) throw new Error("Die Falle hat dich schon erwischt.");
  return settleRoom(reactToTrap(state, room, heroId, choice, armorClass, rng), deciders, now, false, rng, () => "");
}

function reactToTrap(
  state: CoopBattleState,
  room: Extract<CoopRoom, { kind: "trap" }>,
  heroId: string,
  choice: TrapChoice,
  armorClass: ArmorClass,
  rng: () => number,
): CoopBattleState {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return state;
  const { dodged, damage } = trapOutcome(choice, armorClass, hero.combatant.maxHp, hero.combatant.hp, rng);
  const outcomes = { ...room.outcomes, [heroId]: { choice, dodged, damage } };
  return withRun(state, { ...state.dungeon!, room: { ...room, outcomes } }, {
    heroes: state.heroes.map((h) => (h.id === heroId ? { ...h, combatant: { ...h.combatant, hp: h.combatant.hp - damage } } : h)),
  });
}

/** Rätsel: Stimme für eine Antwort. Haben alle gewählt, zählt die Mehrheit. */
export function coopRiddle(
  state: CoopBattleState,
  heroId: string,
  answer: string,
  deciders: Deciders,
  rng: () => number,
  newId: () => string,
  now: number,
): CoopBattleState {
  const room = roomOf(state, "riddle");
  if (room.done) throw new Error("Das Rätsel ist schon beantwortet.");
  if (!room.options.includes(answer)) throw new Error("Diese Antwort steht nicht zur Wahl.");
  const votes = { ...room.votes, [heroId]: answer };
  return settleRoom(withRun(state, { ...state.dungeon!, room: { ...room, votes } }), deciders, now, false, rng, newId);
}

/** Truhe: Stimme für Öffnen oder Liegenlassen. Haben alle gewählt, zählt die Mehrheit. */
export function coopChest(
  state: CoopBattleState,
  heroId: string,
  choice: ChestChoice,
  deciders: Deciders,
  rng: () => number,
  newId: () => string,
  now: number,
): CoopBattleState {
  const room = roomOf(state, "chest");
  if (room.done) throw new Error("Über die Truhe ist schon entschieden.");
  const votes = { ...room.votes, [heroId]: choice };
  return settleRoom(withRun(state, { ...state.dungeon!, room: { ...room, votes } }), deciders, now, false, rng, newId);
}

/**
 * Raum abschliessen, wenn alle Anwesenden gehandelt haben – oder zur Deadline (`force`): Wer keinen
 * Segen gewählt hat, bekommt den ersten, wer nicht auf die Falle reagiert hat, steckt ein, beim Rätsel
 * und bei der Truhe zählen die abgegebenen Stimmen (ohne Stimme bleibt die Truhe zu). Danach läuft
 * die Frist für die nächste Tür.
 */
export function settleRoom(
  state: CoopBattleState,
  deciders: Deciders,
  now: number,
  force: boolean,
  rng: () => number,
  newId: () => string,
  armorOf: (heroId: string) => ArmorClass = () => "medium",
): CoopBattleState {
  const room = openRoom(state);
  if (!room) return state;
  const missing = (acted: Record<string, unknown>) => deciders.present.filter((id) => acted[id] === undefined);
  const done = (next: CoopBattleState, extra: Partial<CoopDungeonRun> = {}): CoopBattleState =>
    withRun(next, { ...next.dungeon!, ...extra, room: { ...next.dungeon!.room!, done: true } as CoopRoom }, {
      deadline: now + COOP_DECIDE_SECONDS * 1000,
    });

  if (room.kind === "shrine") {
    if (!force && missing(room.chosen).length > 0) return state;
    let next = state;
    for (const hero of state.heroes) {
      if (room.chosen[hero.id] || !room.offers[hero.id]?.length) continue;
      const id = room.offers[hero.id][0];
      next = grantBlessing(next, next.dungeon!, hero.id, id);
      const current = next.dungeon!.room as Extract<CoopRoom, { kind: "shrine" }>;
      next = withRun(next, { ...next.dungeon!, room: { ...current, chosen: { ...current.chosen, [hero.id]: id } } });
    }
    return done(next);
  }

  if (room.kind === "trap") {
    if (!force && missing(room.outcomes).length > 0) return state;
    let next = state;
    for (const hero of state.heroes) {
      const current = next.dungeon!.room as Extract<CoopRoom, { kind: "trap" }>;
      if (!current.outcomes[hero.id]) next = reactToTrap(next, current, hero.id, "endure", armorOf(hero.id), rng);
    }
    return done(next);
  }

  if (room.kind === "riddle") {
    if (!force && missing(room.votes).length > 0) return state;
    const riddle = getRiddle(room.riddleId);
    const answer = majority(room.votes, room.options, deciders.hostId);
    const run = state.dungeon!;
    if (answer === riddle.answer) {
      const outcome = { answer, correct: true, damage: 0 };
      return done(withRun(state, { ...run, riddles: { ...run.riddles, [run.stage]: "solved" }, room: { ...room, outcome } }));
    }
    if (riddle.failure === "guardian") {
      // Ein Wächter erwacht: ein Kampf an diesem Schritt, danach geht es weiter wie nach jedem Sieg
      const outcome = { answer, correct: false, damage: 0 };
      const fightRun = { ...run, riddles: { ...run.riddles, [run.stage]: "guardian" as const }, room: { ...room, done: true, outcome } };
      return startDungeonFight(state, fightRun, newId(), now);
    }
    // Falsch: Die Runen versengen alle – niemand fällt davon
    const damageOf = (h: CoopHero) => Math.min(Math.round(h.combatant.maxHp * RIDDLE_DAMAGE), h.combatant.hp - 1);
    const heroes = state.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: h.combatant.hp - damageOf(h) } }));
    const damage = Math.max(0, ...state.heroes.map(damageOf));
    const next = withRun(state, { ...run, riddles: { ...run.riddles, [run.stage]: "wrong" }, room: { ...room, outcome: { answer, correct: false, damage } } }, { heroes });
    return done(next);
  }

  if (room.kind === "chest") {
    if (!force && missing(room.votes).length > 0) return state;
    // Bei Gleichstand ohne Stimme des Hosts bleibt die Truhe lieber zu
    const choice = majority(room.votes, ["leave", "open"] as const, deciders.hostId);
    const run = state.dungeon!;
    const mimic = choice === "open" && isMimicChest(run.runId, run.stage);
    const outcome = { choice, mimic };
    if (mimic) {
      // Die Truhe beisst zurück: ein Kampf gegen den Mimic an diesem Schritt
      const fightRun = { ...run, chests: { ...run.chests, [run.stage]: "mimic" as const }, room: { ...room, done: true, outcome } };
      return startDungeonFight(state, fightRun, newId(), now);
    }
    const result = choice === "open" ? ("opened" as const) : ("left" as const);
    return done(withRun(state, { ...run, chests: { ...run.chests, [run.stage]: result }, room: { ...room, outcome } }));
  }
  return state;
}
