// Datenform eines Tauschs, wie er in der Tabelle `trades` liegt, und die
// Befehle, die Spieler an den Tausch-Server schicken (docs/item-tausch.md).
// Wird von Browser und Edge Function gemeinsam genutzt.

import type { OwnedItem } from "../domain/types";

/** "done" = abgeschlossen, beide Clients führen den Tausch aus; "cancelled" = abgebrochen. */
export type TradeStatus = "open" | "done" | "cancelled";

export interface TradeRow {
  id: string;
  /** Einladungscode (wie beim Koop, siehe `newLobbyCode`) */
  code: string;
  /** Wer eröffnet hat, steht vorne. Höchstens zwei – nur sie dürfen den Tausch lesen. */
  player_ids: string[];
  /** Heldennamen für die Anzeige, nach Spieler-Id */
  names: Record<string, string>;
  /** Was jeder hergibt – vom Server gegen den Spielstand geprüft (`checkOffer`) */
  offers: Record<string, OwnedItem[]>;
  /** „Bereit“ – jede Änderung an einem Angebot setzt beide zurück */
  ready: Record<string, boolean>;
  /** „Tauschen“ bestätigt – erst möglich, wenn beide bereit sind */
  confirmed: Record<string, boolean>;
  status: TradeStatus;
  /** Steigt bei jeder Änderung – schützt vor gleichzeitigem Überschreiben */
  version: number;
  updated_at: string;
  completed_at: string | null;
}

export type TradeCommand =
  | { type: "create" }
  | { type: "join"; code: string }
  /** Eigenes Angebot ersetzen (Items aus dem Inventar) */
  | { type: "offer"; items: unknown[] }
  | { type: "ready"; ready: boolean }
  | { type: "confirm" }
  | { type: "cancel" };

/** Antwort des Servers: der neue Stand des Tauschs. */
export interface TradeResponse {
  row: TradeRow;
}
