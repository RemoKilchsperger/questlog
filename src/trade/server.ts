// Server-Logik des Item-Tauschs: Befehle auf einen Tausch-Datensatz anwenden.
// Rein und ohne Datenbank – die Edge Function (supabase/functions/trade) lädt und
// speichert, der lokale Testmodus nutzt dieselbe Logik im Browser.
//
// Was im Angebot liegt, prüft der Server gegen den Spielstand des Anbieters
// (`traderFromSave`). Den Besitzerwechsel trägt danach die Datenbank ein
// (Trigger auf `trades`), die Clients führen den Tausch am eigenen Spielstand aus.

import { convertLinearCurveXp, getLevel } from "../domain/leveling";
import { checkOffer, TRADE_DAILY_LIMIT, TradeError, tradeLockReason } from "../domain/trade";
import type { Character, OwnedItem } from "../domain/types";
import type { TradeCommand, TradeRow } from "./protocol";

export { TradeError } from "../domain/trade";

/** Was der Server über einen Spieler wissen muss – aus seinem Spielstand. */
export interface Trader {
  id: string;
  name: string;
  level: number;
  inventory: OwnedItem[];
}

export interface TradeContext {
  userId: string;
  now: number;
  newId: () => string;
  newCode: () => string;
  /** Frische Daten aus den Spielständen: immer der handelnde Spieler, beim Abschluss wenn möglich beide */
  traders: Record<string, Trader>;
  /** Abgeschlossene Tausche der letzten 24 Stunden pro Spieler (fehlt = nicht geprüft) */
  tradesToday?: Record<string, number>;
  /** Andere offene Tausche des handelnden Spielers */
  openTrades?: number;
}

/** Offene und abgebrochene Tausche räumt der Server nach dieser Zeit weg (abgeschlossene bleiben). */
export const TRADE_ROW_TTL_HOURS = 24;

/** Spieler aus einem gespeicherten Spielstand (Inhalt von localStorage "questlog-save" bzw. saves.data). */
export function traderFromSave(id: string, save: unknown): Trader {
  const saved = save as { state?: { character?: Partial<Character>; inventory?: OwnedItem[] }; version?: number } | null;
  const character = saved?.state?.character;
  if (!character) throw new TradeError("Kein Cloud-Spielstand gefunden – bitte einmal online speichern.");
  // Stände vor v15 (lineare Level-Kurve) sind noch nicht umgerechnet
  const totalXp =
    typeof saved?.version === "number" && saved.version < 15 ? convertLinearCurveXp(character.totalXp ?? 0) : (character.totalXp ?? 0);
  return {
    id,
    name: character.name ?? "Held",
    level: getLevel(totalXp),
    inventory: Array.isArray(saved?.state?.inventory) ? saved.state.inventory : [],
  };
}

/** Der andere Spieler im Tausch (null, solange niemand beigetreten ist). */
export function partnerOf(row: TradeRow, userId: string): string | null {
  return row.player_ids.find((id) => id !== userId) ?? null;
}

/**
 * Wendet einen Befehl an und gibt den neuen Datensatz zurück – unverändert, wenn es
 * nichts zu tun gibt. Ungültiges wirft einen TradeError.
 */
export function applyTradeCommand(row: TradeRow | null, command: TradeCommand, ctx: TradeContext): TradeRow {
  if (command.type === "create") return create(ctx);
  if (!row) throw new TradeError("Diesen Tausch gibt es nicht mehr.");
  if (command.type === "join") return join(row, ctx);
  if (!row.player_ids.includes(ctx.userId)) throw new TradeError("Du bist nicht Teil dieses Tauschs.");
  if (command.type === "cancel") return cancel(row, ctx);
  if (row.status !== "open") throw new TradeError(row.status === "done" ? "Der Tausch ist schon abgeschlossen." : "Der Tausch wurde abgebrochen.");

  switch (command.type) {
    case "offer":
      return offer(row, command.items, ctx);
    case "ready":
      return ready(row, command.ready, ctx);
    case "confirm":
      return confirm(row, ctx);
  }
}

const touch = (row: TradeRow, ctx: TradeContext, changes: Partial<TradeRow>): TradeRow => ({
  ...row,
  ...changes,
  version: row.version + 1,
  updated_at: new Date(ctx.now).toISOString(),
});

function traderOf(ctx: TradeContext, id: string): Trader {
  const trader = ctx.traders[id];
  if (!trader) throw new TradeError("Kein Cloud-Spielstand gefunden – bitte einmal online speichern.");
  return trader;
}

/** Darf dieser Spieler einen Tausch beginnen? Level, offene Tausche, Tageslimit. */
function checkCanTrade(ctx: TradeContext, trader: Trader) {
  const locked = tradeLockReason(trader.level);
  if (locked) throw new TradeError(locked);
  if ((ctx.openTrades ?? 0) > 0) throw new TradeError("Du hast schon einen offenen Tausch.");
  checkDailyLimit(ctx, trader.id);
}

function checkDailyLimit(ctx: TradeContext, id: string) {
  if ((ctx.tradesToday?.[id] ?? 0) >= TRADE_DAILY_LIMIT) {
    throw new TradeError(`Höchstens ${TRADE_DAILY_LIMIT} Tausche in 24 Stunden – ${ctx.traders[id]?.name ?? "dein Partner"} hat das Limit erreicht.`);
  }
}

function create(ctx: TradeContext): TradeRow {
  const trader = traderOf(ctx, ctx.userId);
  checkCanTrade(ctx, trader);
  const now = new Date(ctx.now).toISOString();
  return {
    id: ctx.newId(),
    code: ctx.newCode(),
    player_ids: [ctx.userId],
    names: { [ctx.userId]: trader.name },
    offers: { [ctx.userId]: [] },
    ready: {},
    confirmed: {},
    status: "open",
    version: 1,
    updated_at: now,
    completed_at: null,
  };
}

function join(row: TradeRow, ctx: TradeContext): TradeRow {
  if (row.player_ids.includes(ctx.userId)) return row;
  if (row.status !== "open") throw new TradeError("Dieser Tausch ist schon beendet.");
  if (row.player_ids.length >= 2) throw new TradeError("An diesem Tausch nehmen schon zwei Spieler teil.");
  const trader = traderOf(ctx, ctx.userId);
  checkCanTrade(ctx, trader);
  return touch(row, ctx, {
    player_ids: [...row.player_ids, ctx.userId],
    names: { ...row.names, [ctx.userId]: trader.name },
    offers: { ...row.offers, [ctx.userId]: [] },
    ready: {},
    confirmed: {},
  });
}

function offer(row: TradeRow, items: unknown[], ctx: TradeContext): TradeRow {
  if (!Array.isArray(items)) throw new TradeError("Ungültiges Angebot.");
  const checked = checkOffer(traderOf(ctx, ctx.userId).inventory, items);
  // Jede Änderung am Angebot setzt beide zurück – niemand tauscht im letzten Moment etwas aus
  return touch(row, ctx, { offers: { ...row.offers, [ctx.userId]: checked }, ready: {}, confirmed: {} });
}

function ready(row: TradeRow, isReady: boolean, ctx: TradeContext): TradeRow {
  if (isReady && row.player_ids.length < 2) throw new TradeError("Warte, bis dein Tauschpartner beigetreten ist.");
  if (Boolean(row.ready[ctx.userId]) === isReady) return row;
  return touch(row, ctx, { ready: { ...row.ready, [ctx.userId]: isReady }, confirmed: isReady ? row.confirmed : {} });
}

function confirm(row: TradeRow, ctx: TradeContext): TradeRow {
  const partner = partnerOf(row, ctx.userId);
  if (!partner) throw new TradeError("Warte, bis dein Tauschpartner beigetreten ist.");
  if (!row.ready[ctx.userId] || !row.ready[partner]) throw new TradeError("Erst müssen beide bereit sein.");
  if (row.player_ids.every((id) => (row.offers[id] ?? []).length === 0)) throw new TradeError("Im Tausch liegt noch kein Item.");
  if (row.confirmed[ctx.userId]) return row;

  // Das eigene Angebot muss noch genau so im Spielstand liegen
  checkOffer(traderOf(ctx, ctx.userId).inventory, row.offers[ctx.userId] ?? []);
  const confirmed = { ...row.confirmed, [ctx.userId]: true };
  if (!confirmed[partner]) return touch(row, ctx, { confirmed });

  // Abschluss: auch das Angebot des Partners noch einmal prüfen (sofern sein Spielstand vorliegt)
  const partnerTrader = ctx.traders[partner];
  if (partnerTrader) checkOffer(partnerTrader.inventory, row.offers[partner] ?? []);
  for (const id of row.player_ids) checkDailyLimit(ctx, id);
  return touch(row, ctx, { confirmed, status: "done", completed_at: new Date(ctx.now).toISOString() });
}

function cancel(row: TradeRow, ctx: TradeContext): TradeRow {
  if (row.status === "cancelled") return row;
  if (row.status === "done") throw new TradeError("Der Tausch ist schon abgeschlossen.");
  return touch(row, ctx, { status: "cancelled", ready: {}, confirmed: {} });
}

/** Ausführen am eigenen Spielstand: was ich hergebe und was ich bekomme. */
export function tradeSides(row: TradeRow, userId: string): { give: OwnedItem[]; receive: OwnedItem[] } {
  const partner = partnerOf(row, userId);
  return { give: row.offers[userId] ?? [], receive: partner ? (row.offers[partner] ?? []) : [] };
}
