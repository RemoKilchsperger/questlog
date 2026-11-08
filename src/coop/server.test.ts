import { describe, expect, it } from "vitest";
import { clearedStages, COOP_TURN_SECONDS, getCoopBoss, rollCoopDungeonChest } from "../domain/coopCombat";
import { COOP_DECIDE_SECONDS, coopDoors } from "../domain/coopDungeonPaths";
import { getDungeon } from "../domain/creatures";
import { forkDoors, getMimic, getRiddle, isMimicChest, type RoomKind } from "../domain/dungeonPaths";
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
    version: 15,
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

  it("rechnet das Gericht aus der Taverne ein", () => {
    const save = saveAt(30, "x");
    const fed = memberFromSave("x", { ...save, state: { ...save.state, meal: "stew" } }, null);
    expect(fed.profile.maxHp).toBe(Math.round(member("x", 30).profile.maxHp * 1.1));
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

  it("beitreten nur mit passendem Level – über die Freundesliste wie per Code", () => {
    const row = run(null, { type: "create", bossId: "swamp-hydra" }, "a")!;
    expect(() => run(row, { type: "joinFriend", friendId: "a" }, "b", { member: member("b", 5) })).toThrow(/ab Level/);
    expect(() => run(row, { type: "join", code: row.code }, "b", { member: member("b", 5) })).toThrow(/ab Level/);
    const joined = run(row, { type: "joinFriend", friendId: "a" }, "c")!;
    expect(joined.player_ids).toEqual(["a", "c"]);
    expect(joined.members[1].ready).toBe(false);
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
  const dungeonRow = (runId = "id-a") => {
    let row = run(null, { type: "create", bossId: "abandoned-mine" }, "a")!;
    row = run(row, { type: "join", code: row.code }, "b")!;
    row = run(row, { type: "ready", ready: true }, "b")!;
    return run(row, { type: "start" }, "a", { members: { a: member("a"), b: member("b") }, newId: () => runId })!;
  };
  /** Weiter zum nächsten Schritt: an einer Gabelung stimmen beide für eine Kampf-Tür, sonst geht der Host weiter. */
  const onward = (row: CoopRow, id: string) => {
    const doors = coopDoors(row.state!);
    if (!doors) return run(row, { type: "next" }, "a", { newId: () => id })!;
    const index = doors.findIndex((d) => d.kind === "fight" || d.kind === "elite");
    const voted = run(row, { type: "door", index }, "a", { newId: () => id })!;
    return run(voted, { type: "door", index }, "b", { newId: () => id })!;
  };
  /** Startwert eines Laufs, dessen erste Gabelung diese Tür hat. */
  const runWithDoor = (kind: RoomKind) => {
    for (let i = 0; ; i++) if (forkDoors(`r${i}`, 1, true).some((d) => d.kind === kind)) return `r${i}`;
  };
  /** Nach dem Eingangskampf gemeinsam durch die Tür dieser Art (`runId`: Startwert mit dieser Tür an der ersten Gabelung). */
  const enterRoom = (kind: RoomKind, runId = runWithDoor(kind)) => {
    const row = winFight(dungeonRow(runId));
    const index = coopDoors(row.state!)!.findIndex((d) => d.kind === kind);
    return run(run(row, { type: "door", index }, "a")!, { type: "door", index }, "b")!;
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

  it("heroisch erst, wenn der Host den Endboss besiegt hat", () => {
    const heroic = "abandoned-mine:heroic";
    expect(() => run(null, { type: "create", bossId: heroic }, "a")).toThrow(/Erzkönig/);
    const save = saveAt(25, "a");
    const veteran = memberFromSave("a", { ...save, state: { ...save.state, records: { bossesDefeated: ["ore-king"] } } }, null);
    expect(run(null, { type: "create", bossId: heroic }, "a", { member: veteran })?.boss_id).toBe(heroic);
    expect(() => run(null, { type: "create", bossId: "swamp-hydra:heroic" }, "a", { member: veteran })).toThrow(CoopError);
  });

  it("nach einem Sieg bleibt der Kampf offen – an der Gabelung stimmen alle über die Tür ab", () => {
    const row = winFight(dungeonRow());
    expect(row.phase).toBe("battle");
    expect(row.state!.status).toBe("won");
    expect(() => run(row, { type: "next" }, "a")).toThrow(/Gabelung/);
    const doors = coopDoors(row.state!)!;
    const index = doors.findIndex((d) => d.kind === "fight" || d.kind === "elite");
    // Erst eine Stimme: es wird gewartet
    const one = run(row, { type: "door", index }, "a", { newId: () => "stage-2" })!;
    expect(one.state!.status).toBe("won");
    expect(one.state!.dungeon!.votes).toEqual({ a: index });
    const next = run(one, { type: "door", index }, "b", { newId: () => "stage-2" })!;
    expect(next.state!.id).toBe("stage-2");
    expect(next.state!.dungeon!.stage).toBe(1);
    expect(next.state!.dungeon!.path).toEqual(["fight", doors[index].kind]);
    expect(next.state!.status).toBe("active");
    // Veralteter Klick: nichts passiert
    expect(run(next, { type: "door", index }, "a")).toBe(next);
  });

  it("bei Gleichstand zählt die Stimme des Hosts, nach Ablauf der Zeit die abgegebenen", () => {
    const row = winFight(dungeonRow(runWithDoor("shrine")));
    const doors = coopDoors(row.state!)!;
    const shrine = doors.findIndex((d) => d.kind === "shrine");
    const fight = doors.findIndex((d) => d.kind === "fight" || d.kind === "elite");
    const tie = run(run(row, { type: "door", index: fight }, "b")!, { type: "door", index: shrine }, "a")!;
    expect(tie.state!.dungeon!.path![1]).toBe("shrine");
    // Nur b stimmt, die Zeit läuft ab: seine Tür gilt
    const late = run(row, { type: "door", index: shrine }, "b")!;
    expect(run(late, { type: "tick" }, "a")).toBe(late);
    const forced = run(late, { type: "tick" }, "a", { now: clock + COOP_DECIDE_SECONDS * 1000 + 1 })!;
    expect(forced.state!.dungeon!.room?.kind).toBe("shrine");
  });

  it("Schrein: jeder wählt seinen Segen, danach geht es weiter", () => {
    const row = enterRoom("shrine");
    const room = row.state!.dungeon!.room!;
    if (room.kind !== "shrine") throw new Error("kein Schrein");
    expect(Object.keys(room.offers).sort()).toEqual(["a", "b"]);
    const a = run(row, { type: "blessing", blessing: room.offers.a[0] }, "a")!;
    expect(a.state!.dungeon!.room!.done).toBe(false);
    expect(a.state!.heroes.find((h) => h.id === "a")!.blessings).toEqual([room.offers.a[0]]);
    const both = run(a, { type: "blessing", blessing: room.offers.b[1] }, "b")!;
    expect(both.state!.dungeon!.room!.done).toBe(true);
    expect(both.state!.heroes.find((h) => h.id === "b")!.blessings).toEqual([room.offers.b[1]]);
    // Höchstens ein Raum ohne Kampf im Abschnitt: an der nächsten Gabelung nur Kämpfe
    expect(coopDoors(both.state!)!.every((d) => d.kind === "fight" || d.kind === "elite")).toBe(true);
  });

  it("Falle: jeder reagiert selbst, keiner fällt – dahinter Beute ohne Erfahrung", () => {
    const row = enterRoom("trap");
    const a = run(row, { type: "trap", choice: "endure" }, "a")!;
    const both = run(a, { type: "trap", choice: "dodge" }, "b")!;
    const room = both.state!.dungeon!.room!;
    if (room.kind !== "trap") throw new Error("keine Falle");
    expect(room.done).toBe(true);
    expect(room.outcomes.a.damage).toBeGreaterThan(0);
    expect(both.state!.heroes.every((h) => h.combatant.hp >= 1)).toBe(true);
    expect(clearedStages(both.state!)).toBe(2);
    const chest = rollCoopDungeonChest(both.state!, member("a").profile, "a");
    const before = rollCoopDungeonChest(row.state!, member("a").profile, "a");
    expect(chest.xp).toBe(before.xp);
  });

  it("Rätsel: die Mehrheit antwortet", () => {
    const row = enterRoom("riddle");
    const room = row.state!.dungeon!.room!;
    if (room.kind !== "riddle") throw new Error("kein Rätsel");
    const answer = getRiddle(room.riddleId).answer;
    const done = run(run(row, { type: "riddle", answer }, "a")!, { type: "riddle", answer }, "b")!;
    expect(done.state!.dungeon!.riddles).toEqual({ 1: "solved" });
    expect(done.state!.dungeon!.room!.done).toBe(true);
  });

  /** Startwert mit einer Truhe an der ersten Gabelung, die (k)ein Mimic ist. */
  const chestRun = (mimic: boolean) => {
    for (let i = 0; ; i++) {
      const id = `c${i}`;
      if (forkDoors(id, 1, true).some((d) => d.kind === "chest") && isMimicChest(id, 1) === mimic) return id;
    }
  };

  it("Truhe: die Mehrheit entscheidet – bei Gleichstand der Host, ohne Stimmen bleibt sie zu", () => {
    const row = enterRoom("chest", chestRun(false));
    const room = row.state!.dungeon!.room!;
    expect(room.kind).toBe("chest");
    // a will öffnen, b nicht: der Host (a) gibt den Ausschlag
    const tie = run(run(row, { type: "chest", choice: "leave" }, "b")!, { type: "chest", choice: "open" }, "a")!;
    expect(tie.state!.dungeon!.chests).toEqual({ 1: "opened" });
    expect(tie.state!.dungeon!.room!.done).toBe(true);
    // Geöffnet: Beute ohne Erfahrung
    const before = rollCoopDungeonChest(row.state!, member("a").profile, "a");
    const after = rollCoopDungeonChest(tie.state!, member("a").profile, "a");
    expect(after.xp).toBe(before.xp);
    // Niemand stimmt, die Zeit läuft ab: die Truhe bleibt zu
    const forced = run(row, { type: "tick" }, "a", { now: clock + COOP_DECIDE_SECONDS * 1000 + 1 })!;
    expect(forced.state!.dungeon!.chests).toEqual({ 1: "left" });
  });

  it("Truhe als Mimic: ein Kampf, danach Elite-Beute mit Erfahrung für jeden", () => {
    const row = enterRoom("chest", chestRun(true));
    const both = run(run(row, { type: "chest", choice: "open" }, "a", { newId: () => "mimic" })!, { type: "chest", choice: "open" }, "b", {
      newId: () => "mimic",
    })!;
    expect(both.state!.id).toBe("mimic");
    expect(both.state!.status).toBe("active");
    expect(both.state!.bossId).toBe(getMimic(getDungeon("abandoned-mine")).id);
    expect(both.state!.elite).toBeUndefined();
    expect(both.state!.dungeon!.chests).toEqual({ 1: "mimic" });
    const won = winFight(both);
    expect(won.state!.status).toBe("won");
    const before = rollCoopDungeonChest(row.state!, member("a").profile, "a");
    const after = rollCoopDungeonChest(won.state!, member("a").profile, "a");
    expect(after.xp).toBeGreaterThan(before.xp);
    expect(after.items.length).toBe(before.items.length + 1);
    expect(coopDoors(won.state!)).not.toBeNull();
  });

  it("Händler: jeder kauft für sich, Wundversorgung heilt", () => {
    let row = enterRoom("merchant");
    const room = row.state!.dungeon!.room!;
    if (room.kind !== "merchant") throw new Error("kein Händler");
    row = { ...row, state: { ...row.state!, heroes: row.state!.heroes.map((h) => ({ ...h, combatant: { ...h.combatant, hp: 1 } })) } };
    const care = room.offers.a.findIndex((o) => o.kind === "care");
    const bought = run(row, { type: "buy", index: care }, "a")!;
    expect(bought.state!.heroes.find((h) => h.id === "a")!.combatant.hp).toBeGreaterThan(1);
    expect(() => run(bought, { type: "buy", index: care }, "a")).toThrow(/schon gekauft/);
    // Der Händler hält niemanden auf: die Türen stehen schon zur Wahl
    expect(coopDoors(bought.state!)).not.toBeNull();
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
    // Nur noch b stimmt ab
    const index = coopDoors(row.state!)!.findIndex((d) => d.kind === "fight" || d.kind === "elite");
    expect(run(row, { type: "door", index }, "b")!.state!.dungeon!.stage).toBe(1);
  });

  it("nach dem Endboss ist der Dungeon vorbei", () => {
    let row = dungeonRow();
    const total = getDungeon("abandoned-mine").creatures.length;
    for (let i = 0; i < total - 1; i++) row = onward(winFight(row), `s${i}`);
    row = winFight(row);
    expect(row.state!.bossId).toBe("ore-king");
    expect(row.phase).toBe("finished");
  });
});
