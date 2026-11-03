import { describe, expect, it } from "vitest";
import { createItem } from "../domain/items";
import { xpForNextLevel } from "../domain/leveling";
import { TRADE_DAILY_LIMIT, TRADE_MIN_LEVEL } from "../domain/trade";
import type { OwnedItem } from "../domain/types";
import type { TradeCommand, TradeRow } from "./protocol";
import { applyTradeCommand, TradeError, traderFromSave, tradeSides, type Trader, type TradeContext } from "./server";

const xpFor = (level: number) => {
  let totalXp = 0;
  for (let l = 1; l < level; l++) totalXp += xpForNextLevel(l);
  return totalXp;
};

const swordA = createItem("sword-80", "rare", "a-sword");
const helmA = createItem("head-80", "epic", "a-helm");
const bowB = createItem("bow-80", "legendary", "b-bow");

const traders: Record<string, Trader> = {
  a: { id: "a", name: "Anna", level: 20, inventory: [swordA, helmA] },
  b: { id: "b", name: "Ben", level: 20, inventory: [bowB] },
};

let clock = 1_000_000;
const run = (row: TradeRow | null, command: TradeCommand, userId: string, extra: Partial<TradeContext> = {}) =>
  applyTradeCommand(row, command, {
    userId,
    now: (clock += 1000),
    newId: () => "trade-1",
    newCode: () => "ABCDEF",
    traders,
    ...extra,
  });

/** Tausch von a mit b, a gibt das Schwert, b den Bogen, beide bereit. */
const readyTrade = () => {
  let row = run(null, { type: "create" }, "a");
  row = run(row, { type: "join", code: "ABCDEF" }, "b");
  row = run(row, { type: "offer", items: [swordA] }, "a");
  row = run(row, { type: "offer", items: [bowB] }, "b");
  row = run(row, { type: "ready", ready: true }, "a");
  return run(row, { type: "ready", ready: true }, "b");
};

describe("Tausch-Server: Spielstand", () => {
  it("liest Name, Level und Inventar", () => {
    const trader = traderFromSave("a", { version: 19, state: { character: { name: "Anna", totalXp: xpFor(12) }, inventory: [swordA] } });
    expect(trader).toEqual({ id: "a", name: "Anna", level: 12, inventory: [swordA] });
  });

  it("ohne Spielstand geht es nicht", () => {
    expect(() => traderFromSave("a", null)).toThrow(TradeError);
  });
});

describe("Tausch-Server: Eröffnen und Beitreten", () => {
  it("eröffnet einen offenen Tausch mit Code", () => {
    const row = run(null, { type: "create" }, "a");
    expect(row).toMatchObject({ id: "trade-1", code: "ABCDEF", player_ids: ["a"], names: { a: "Anna" }, status: "open", version: 1 });
  });

  it("erst ab dem Mindest-Level", () => {
    const low = { a: { ...traders.a, level: TRADE_MIN_LEVEL - 1 } };
    expect(() => run(null, { type: "create" }, "a", { traders: low })).toThrow(/ab Level/);
    const row = run(null, { type: "create" }, "a");
    expect(() => run(row, { type: "join", code: "ABCDEF" }, "b", { traders: { b: { ...traders.b, level: 1 } } })).toThrow(/ab Level/);
  });

  it("nur ein offener Tausch und höchstens das Tageslimit", () => {
    expect(() => run(null, { type: "create" }, "a", { openTrades: 1 })).toThrow(/offenen Tausch/);
    expect(() => run(null, { type: "create" }, "a", { tradesToday: { a: TRADE_DAILY_LIMIT } })).toThrow(/Höchstens/);
  });

  it("höchstens zwei Spieler, doppeltes Beitreten ändert nichts", () => {
    let row = run(null, { type: "create" }, "a");
    row = run(row, { type: "join", code: "ABCDEF" }, "b");
    expect(row.player_ids).toEqual(["a", "b"]);
    expect(run(row, { type: "join", code: "ABCDEF" }, "b")).toBe(row);
    const c: Trader = { id: "c", name: "Cleo", level: 30, inventory: [] };
    expect(() => run(row, { type: "join", code: "ABCDEF" }, "c", { traders: { c } })).toThrow(/schon zwei/);
  });

  it("Fremde dürfen nichts ändern", () => {
    const row = run(null, { type: "create" }, "a");
    expect(() => run(row, { type: "offer", items: [] }, "x")).toThrow(/nicht Teil/);
  });
});

describe("Tausch-Server: Angebot, Bereit und Abschluss", () => {
  it("Angebot muss im Inventar liegen", () => {
    let row = run(null, { type: "create" }, "a");
    row = run(row, { type: "join", code: "ABCDEF" }, "b");
    expect(() => run(row, { type: "offer", items: [bowB] }, "a")).toThrow(/nicht mehr im Inventar/);
    const fake: OwnedItem = { ...swordA, upgrade: 5 };
    expect(() => run(row, { type: "offer", items: [fake] }, "a")).toThrow(/nicht mehr im Inventar/);
  });

  it("bereit erst mit Partner, eine Änderung am Angebot setzt beide zurück", () => {
    const solo = run(null, { type: "create" }, "a");
    expect(() => run(solo, { type: "ready", ready: true }, "a")).toThrow(/Tauschpartner/);
    let row = readyTrade();
    row = run(row, { type: "confirm" }, "a");
    expect(row.confirmed).toEqual({ a: true });
    row = run(row, { type: "offer", items: [swordA, helmA] }, "a");
    expect(row.ready).toEqual({});
    expect(row.confirmed).toEqual({});
    expect(() => run(row, { type: "confirm" }, "b")).toThrow(/beide bereit/);
  });

  it("nicht mehr bereit nimmt auch die Bestätigung zurück", () => {
    let row = run(readyTrade(), { type: "confirm" }, "a");
    row = run(row, { type: "ready", ready: false }, "b");
    expect(row.confirmed).toEqual({});
  });

  it("schliesst ab, wenn beide bestätigt haben", () => {
    let row = run(readyTrade(), { type: "confirm" }, "a");
    expect(row.status).toBe("open");
    row = run(row, { type: "confirm" }, "b");
    expect(row.status).toBe("done");
    expect(row.completed_at).not.toBeNull();
    expect(tradeSides(row, "a")).toEqual({ give: [swordA], receive: [bowB] });
    expect(tradeSides(row, "b")).toEqual({ give: [bowB], receive: [swordA] });
    expect(() => run(row, { type: "offer", items: [] }, "a")).toThrow(/abgeschlossen/);
    expect(() => run(row, { type: "cancel" }, "a")).toThrow(/abgeschlossen/);
  });

  it("ein Geschenk geht, ein leerer Tausch nicht", () => {
    let row = run(null, { type: "create" }, "a");
    row = run(row, { type: "join", code: "ABCDEF" }, "b");
    row = run(row, { type: "ready", ready: true }, "a");
    row = run(row, { type: "ready", ready: true }, "b");
    expect(() => run(row, { type: "confirm" }, "a")).toThrow(/kein Item/);
    row = run(row, { type: "offer", items: [swordA] }, "a");
    row = run(row, { type: "ready", ready: true }, "a");
    row = run(row, { type: "ready", ready: true }, "b");
    row = run(row, { type: "confirm" }, "a");
    expect(run(row, { type: "confirm" }, "b").status).toBe("done");
  });

  it("verkauft oder angelegt nach dem Angebot: der Abschluss scheitert", () => {
    const row = run(readyTrade(), { type: "confirm" }, "a");
    const sold = { ...traders, a: { ...traders.a, inventory: [helmA] } };
    expect(() => run(row, { type: "confirm" }, "b", { traders: sold })).toThrow(/nicht mehr im Inventar/);
  });

  it("Tageslimit gilt beim Abschluss für beide", () => {
    const row = run(readyTrade(), { type: "confirm" }, "a");
    expect(() => run(row, { type: "confirm" }, "b", { tradesToday: { a: TRADE_DAILY_LIMIT } })).toThrow(/Anna hat das Limit/);
  });

  it("abbrechen beendet den Tausch", () => {
    const row = run(readyTrade(), { type: "cancel" }, "b");
    expect(row.status).toBe("cancelled");
    expect(() => run(row, { type: "confirm" }, "a")).toThrow(/abgebrochen/);
    expect(() => run(row, { type: "join", code: "ABCDEF" }, "c")).toThrow(/beendet/);
  });

  it("jede Änderung erhöht die Version", () => {
    const row = run(null, { type: "create" }, "a");
    const joined = run(row, { type: "join", code: "ABCDEF" }, "b");
    expect(joined.version).toBe(row.version + 1);
  });
});
