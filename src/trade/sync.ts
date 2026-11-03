// Abgleich von Spielstand und abgeschlossenen Tauschen (docs/item-tausch.md, Etappe 4).
// Die Datenbank lehnt einen Spielstand ab, der ein weggetauschtes Item enthält
// (Trigger `reject_foreign_items`). Dann – und nach jedem Login – holt der Client
// nach, was fehlt: abgeschlossene Tausche ausführen, als Rückfall Items entfernen,
// die laut Register jemand anderem gehören (z. B. nach einem alten Spielstand).

import { supabase } from "../cloud/supabase";
import { SAVE_KEY, useGameStore } from "../store/gameStore";
import type { TradeRow } from "./protocol";
import { tradeSides } from "./server";

/** Fehlermeldung der Datenbank, wenn ein Spielstand ein weggetauschtes Item enthält. */
export const FOREIGN_ITEM_ERROR = "QL_FOREIGN_ITEM";

export const isForeignItemError = (message: string | undefined) => !!message?.includes(FOREIGN_ITEM_ERROR);

/** Führt abgeschlossene Tausche aus, die dieser Spielstand noch nicht kennt. Gibt die ausgeführten zurück. */
export function applyDoneTrades(rows: readonly TradeRow[], userId: string): TradeRow[] {
  const game = useGameStore.getState();
  return rows.filter((row) => {
    const { give, receive } = tradeSides(row, userId);
    return game.applyCompletedTrade(row.id, give, receive);
  });
}

/** Alle uids im Spielstand – überall, wie der Trigger sie sucht. */
export function collectUids(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) collectUids(v, into);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "uid" && typeof v === "string") into.push(v);
      else collectUids(v, into);
    }
  }
  return into;
}

function readSave(): unknown {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  } catch {
    return null;
  }
}

/**
 * Bringt den Spielstand mit dem Tausch-Register in Einklang: erst die abgeschlossenen
 * Tausche ausführen, dann alles entfernen, was noch jemand anderem gehört.
 * Gibt zurück, ob sich etwas geändert hat.
 */
export async function settleTrades(userId: string, findDone: (userId: string) => Promise<TradeRow[]>): Promise<boolean> {
  if (!supabase) return false;
  const applied = applyDoneTrades(await findDone(userId), userId);
  // Der Spielstand im localStorage ist nach dem Ausführen schon aktuell (persist schreibt sofort)
  const uids = [...new Set(collectUids(readSave()))];
  if (uids.length === 0) return applied.length > 0;
  const { data, error } = await supabase.rpc("foreign_item_uids", { uids });
  if (error) throw new Error(error.message);
  const removed = useGameStore.getState().removeTradedItems((data as string[] | null) ?? []);
  return applied.length > 0 || removed > 0;
}
