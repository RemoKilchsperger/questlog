import { describe, expect, it } from "vitest";
import { COOP_TURN_SECONDS, getCoopBoss } from "../domain/coopCombat";
import { getDungeon } from "../domain/creatures";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import { createItem } from "../domain/items";
import { xpForNextLevel } from "../domain/leveling";
import type { CoopCommand, CoopMember, CoopRow } from "./protocol";
import { applyCommand, CoopError, dungeonDecider, memberFromSave, type ServerContext } from "./server";

/** Gespeicherter Spielstand eines Helden auf Level `level`. */
const saveAt = (level: number, name = "Held") => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return {
    version: 13,
    state: {
      character: { name, totalXp, stats: { strength: 10, intellect: 5, endurance: 10, charisma: 1 }, skills: {}, abilities: [] },
      equipment: { ...EMPTY_EQUIPMENT, weapon1: createItem("sword-60", "common", "w") },
    },
  };
};
const member = (id: string, level = 25): CoopMember => memberFromSave(id, saveAt(level, id), null);

let clock = 1_000_000;
const ctx = (userId: string, extra: Partial<ServerContext> = {}): ServerContext => ({
  userId,
  now: clock,
  rng: () => 0.5,
  member: member(userId),
  newId: () => `id-${userId}`,
  newCode: () => "ABCDEF",
  ...extra,
});
const run = (row: CoopRow | null, command: CoopCommand, userId: string, extra: Partial<ServerContext> = {}) =>
  applyCommand(row, command, ctx(userId, extra));

/** Lobby von a mit b, beide bereit. */
const readyLobby = () => {
  let row = run(null, { type: "create", bossId: "swamp-hydra" }, "a")!;
  row = run(row, { type: "join", code: row.code }, "b")!;
  return run(row, { type: "ready", ready: true }, "b")!;
};
const started = () => {
  const row = readyLobby();
  return run(row, { type: "start" }, "a", { members: { a: member("a"), b: member("b") } })!;
};

describe("Koop-Server: Kampfwerte aus dem Cloud-Spielstand", () => {
  it("berechnet Level, Werte und Ausrüstung selbst", () => {
    const m = member("x", 30);
    expect(m.level).toBe(30);
    expect(m.profile.damage).toBeGreaterThan(5);
    expect(m.equipment.weapon1?.itemId).toBe("sword-60");
  });

  it("ohne Spielstand geht es nicht", () => {
    expect(() => memberFromSave("x", null, null)).toThrow(CoopError);
  });
});

describe("Koop-Server: Lobby", () => {
  it("erstellen, beitreten, bereit; nur Teilnehmer dürfen handeln", () => {
    const row = readyLobby();
    expect(row.host_id).toBe("a");
    expect(row.player_ids).toEqual(["a", "b"]);
    expect(row.members.map((m) => m.ready)).toEqual([true, true]);
    expect(() => run(row, { type: "ready", ready: true }, "fremd")).toThrow(CoopError);
  });

  it("zu niedriges Level, volle Lobby und laufender Kampf werden abgelehnt", () => {
    expect(() => run(null, { type: "create", bossId: "swamp-hydra" }, "a", { member: member("a", 5) })).toThrow(/Level/);
    let row = run(null, { type: "create", bossId: "swamp-hydra" }, "a")!;
    for (const id of ["b", "c", "d"]) row = run(row, { type: "join", code: row.code }, id)!;
    expect(() => run(row, { type: "join", code: row.code }, "e")).toThrow(/voll/);
    expect(() => run(started(), { type: "join", code: "ABCDEF" }, "e")).toThrow(/läuft bereits/);
  });

  it("geht der Host, übernimmt der nächste; geht der letzte, ist die Lobby weg", () => {
    const row = run(readyLobby(), { type: "leave" }, "a")!;
    expect(row.host_id).toBe("b");
    expect(row.player_ids).toEqual(["b"]);
    expect(run(row, { type: "leave" }, "b")).toBeNull();
  });

  it("nur der Host startet, erst wenn alle bereit sind", () => {
    let row = run(null, { type: "create", bossId: "swamp-hydra" }, "a")!;
    row = run(row, { type: "join", code: row.code }, "b")!;
    expect(() => run(row, { type: "start" }, "a")).toThrow(/bereit/);
    row = run(row, { type: "ready", ready: true }, "b")!;
    expect(() => run(row, { type: "start" }, "b")).toThrow(/Host/);
  });

  it("beim Start zählen die frischen Werte vom Server, nicht die aus der Lobby", () => {
    const strong = member("b", 40);
    const row = run(readyLobby(), { type: "start" }, "a", { members: { a: member("a"), b: strong } })!;
    expect(row.phase).toBe("battle");
    expect(row.state!.heroes.find((h) => h.id === "b")!.combatant.maxHp).toBe(strong.profile.maxHp);
  });
});

describe("Koop-Server: Runden", () => {
  it("löst auf, sobald alle gewählt haben – vorher nicht", () => {
    let row = started();
    row = run(row, { type: "act", round: 1, action: {} }, "a")!;
    expect(row.state!.round).toBe(1);
    expect(Object.keys(row.actions)).toEqual(["a"]);
    // Doppelt wählen und veraltete Runden ändern nichts
    expect(run(row, { type: "act", round: 1, action: { ability: "sword" } }, "a")).toBe(row);
    row = run(row, { type: "act", round: 1, action: {} }, "b")!;
    expect(row.state!.round).toBe(2);
    expect(row.actions).toEqual({});
    expect(row.last_events.length).toBeGreaterThan(0);
  });

  it("nach Ablauf der Zeit löst ein Tick auf, vorher nicht", () => {
    const row = started();
    expect(run(row, { type: "tick" }, "b")).toBe(row);
    clock += COOP_TURN_SECONDS * 1000;
    const next = run(row, { type: "tick" }, "b")!;
    expect(next.state!.round).toBe(2);
  });

  it("wer den Kampf verlässt, wird nicht abgewartet und kann zurückkommen", () => {
    let row = started();
    row = run(row, { type: "act", round: 1, action: {} }, "a")!;
    row = run(row, { type: "leave" }, "b")!;
    expect(row.state!.round).toBe(2); // b wird nicht mehr abgewartet
    expect(row.members.find((m) => m.id === "b")!.left).toBe(true);
    row = run(row, { type: "join", code: row.code }, "b")!;
    expect(row.members.find((m) => m.id === "b")!.left).toBe(false);
  });

  it("ist der Boss besiegt, ist der Kampf vorbei", () => {
    const row = started();
    const weak = { ...row, state: { ...row.state!, boss: { ...row.state!.boss, hp: 1 } } };
    const next = run(run(weak, { type: "act", round: 1, action: {} }, "a"), { type: "act", round: 1, action: {} }, "b")!;
    expect(next.phase).toBe("finished");
    expect(next.state!.status).toBe("won");
    expect(getCoopBoss(next.boss_id).id).toBe("swamp-hydra");
  });
});

describe("Koop-Server: Eingefrorene", () => {
  it("auf eingefrorene Helden wird nicht gewartet", () => {
    const row = started();
    const frozen = {
      ...row,
      state: { ...row.state!, heroes: row.state!.heroes.map((h) => (h.id === "b" ? { ...h, effects: { ...h.effects, frozen: true } } : h)) },
    };
    const next = run(frozen, { type: "act", round: 1, action: {} }, "a")!;
    expect(next.state!.round).toBe(2);
    expect(next.last_events).toContainEqual({ type: "skipped", heroId: "b" });
  });
});

describe("Koop-Server: Dungeons", () => {
  /** Laufender Dungeon von a mit b (Level 25 → Verlassene Mine ab 10). */
  const dungeonRow = () => {
    let row = run(null, { type: "create", bossId: "abandoned-mine" }, "a")!;
    row = run(row, { type: "join", code: row.code }, "b")!;
    row = run(row, { type: "ready", ready: true }, "b")!;
    return run(row, { type: "start" }, "a", { members: { a: member("a"), b: member("b") } })!;
  };
  /** Beide greifen an, der Gegner hat nur noch 1 LP. */
  const winFight = (row: CoopRow) => {
    const weak = { ...row, state: { ...row.state!, boss: { ...row.state!.boss, hp: 1 } } };
    const round = weak.state.round;
    const next = run(weak, { type: "act", round, action: {} }, "a")!;
    return run(next, { type: "act", round, action: {} }, "b")!;
  };

  it("eine Lobby für einen Dungeon braucht dessen Mindestlevel", () => {
    expect(() => run(null, { type: "create", bossId: "void-abyss" }, "a")).toThrow(/ab Level 60/);
    expect(() => run(null, { type: "create", bossId: "gibt-es-nicht" }, "a")).toThrow(CoopError);
    expect(run(null, { type: "create", bossId: "abandoned-mine" }, "a")?.boss_id).toBe("abandoned-mine");
  });

  it("nach einem Sieg bleibt der Kampf offen – nur der Host geht weiter", () => {
    const row = winFight(dungeonRow());
    expect(row.phase).toBe("battle");
    expect(row.state!.status).toBe("won");
    expect(() => run(row, { type: "next" }, "b")).toThrow(/Host/);
    const next = run(row, { type: "next" }, "a", { newId: () => "stage-2" })!;
    expect(next.state!.id).toBe("stage-2");
    expect(next.state!.dungeon!.stage).toBe(1);
    expect(next.state!.status).toBe("active");
    // Doppelter Klick: nichts passiert
    expect(run(next, { type: "next" }, "a")).toBe(next);
  });

  it("aussteigen beendet den Dungeon mit Sieg – mitten im Kampf geht es nicht", () => {
    const fighting = dungeonRow();
    expect(run(fighting, { type: "exit" }, "a")).toBe(fighting);
    const row = run(winFight(fighting), { type: "exit" }, "a")!;
    expect(row.phase).toBe("finished");
    expect(row.state!.status).toBe("won");
  });

  it("hat der Host den Kampf verlassen, entscheidet der nächste Anwesende", () => {
    const row = run(winFight(dungeonRow()), { type: "leave" }, "a")!;
    expect(dungeonDecider(row)).toBe("b");
    expect(run(row, { type: "next" }, "b")!.state!.dungeon!.stage).toBe(1);
  });

  it("nach dem Endboss ist der Dungeon vorbei", () => {
    let row = dungeonRow();
    const total = getDungeon("abandoned-mine").creatures.length;
    for (let i = 0; i < total - 1; i++) row = run(winFight(row), { type: "next" }, "a", { newId: () => `s${i}` })!;
    row = winFight(row);
    expect(row.state!.bossId).toBe("ore-king");
    expect(row.phase).toBe("finished");
  });
});
