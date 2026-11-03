// Edge Function "trade": die einzige Stelle, die Tausche schreibt
// (docs/item-tausch.md). Ablauf pro Anfrage:
//   1. Anmeldung prüfen (JWT des Spielers)
//   2. Tausch laden, Inventar und Level aus den Cloud-Spielständen lesen
//   3. Befehl mit der gemeinsamen Spiellogik anwenden (_shared/trade-server.js)
//   4. Speichern – nur, wenn niemand dazwischen geändert hat (Versionsprüfung),
//      sonst neu laden und nochmal versuchen. Beim Abschluss trägt der Trigger
//      auf `trades` die neuen Besitzer ein.
//
// Die Spiellogik kommt gebündelt aus src/trade/edge.ts: `npm run functions:build`.
// Deploy: `npm run functions:deploy -- --project-ref <ref>`

import { createClient } from "npm:@supabase/supabase-js@2";
import { applyTradeCommand, newLobbyCode, TRADE_ROW_TTL_HOURS, TradeError, traderFromSave } from "../_shared/trade-server.js";

// Schlanke Typen für diese Datei – die vollständigen stehen in src/trade/protocol.ts.
type TradeCommand = { type: "create" | "confirm" | "cancel" | "offer" | "ready" } | { type: "join"; code: string };
type TradeRow = { id: string; version: number; player_ids: string[]; status: string };
type Trader = { id: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Service-Schlüssel: umgeht RLS – nur hier im Server, nie im Browser.
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function loadTrader(userId: string): Promise<Trader> {
  const save = await admin.from("saves").select("data").eq("user_id", userId).maybeSingle();
  if (save.error) throw save.error;
  return traderFromSave(userId, save.data?.data ?? null);
}

/** Abgeschlossene Tausche dieses Spielers in den letzten 24 Stunden. */
async function tradesToday(userId: string, now: number): Promise<number> {
  const since = new Date(now - 24 * 3600_000).toISOString();
  const { count, error } = await admin
    .from("trades")
    .select("id", { count: "exact", head: true })
    .contains("player_ids", [userId])
    .eq("status", "done")
    .gte("completed_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** Andere offene Tausche dieses Spielers. */
async function openTrades(userId: string, exceptId: string | undefined): Promise<number> {
  let query = admin.from("trades").select("id", { count: "exact", head: true }).contains("player_ids", [userId]).eq("status", "open");
  if (exceptId) query = query.neq("id", exceptId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function loadRow(command: TradeCommand, id: string | undefined): Promise<TradeRow | null> {
  if (command.type === "create") return null;
  const query = admin.from("trades").select("*");
  const result =
    command.type === "join"
      ? await query.eq("code", String(command.code).toUpperCase()).eq("status", "open").maybeSingle()
      : await query.eq("id", id ?? "").maybeSingle();
  if (result.error) throw result.error;
  return (result.data as TradeRow | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Nicht angemeldet." }, 401);
    const userId = auth.user.id;
    const { command, id } = (await req.json()) as { command: TradeCommand; id?: string };

    // Alte offene und abgebrochene Tausche aufräumen; abgeschlossene bleiben für den Abgleich
    if (command.type === "create") {
      const cutoff = new Date(Date.now() - TRADE_ROW_TTL_HOURS * 3600_000).toISOString();
      await admin.from("trades").delete().neq("status", "done").lt("updated_at", cutoff);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await loadRow(command, id);
      const now = Date.now();
      const starting = command.type === "create" || command.type === "join";
      const closing = command.type === "confirm" && row !== null;
      // Wer handelt, braucht immer frische Daten; beim Bestätigen auch der Partner (Abschluss)
      const ids = closing ? row.player_ids : [userId];
      const needsTraders = command.type !== "cancel";
      const traders = needsTraders
        ? Object.fromEntries(await Promise.all(ids.map(async (pid) => [pid, await loadTrader(pid)] as const)))
        : {};
      const today =
        starting || closing
          ? Object.fromEntries(await Promise.all(ids.map(async (pid) => [pid, await tradesToday(pid, now)] as const)))
          : undefined;
      const open = starting ? await openTrades(userId, row?.id) : undefined;

      const next = applyTradeCommand(row, command, {
        userId,
        now,
        newId: () => crypto.randomUUID(),
        newCode: () => newLobbyCode(),
        traders,
        tradesToday: today,
        openTrades: open,
      });

      if (next === row) return json({ row });
      if (!row) {
        const insert = await admin.from("trades").insert(next);
        if (insert.error?.code === "23505") continue; // Code schon vergeben – neuer Versuch
        if (insert.error) throw insert.error;
        return json({ row: next });
      }
      const result = await admin.from("trades").update(next).eq("id", row.id).eq("version", row.version).select("id");
      if (result.error) {
        if (result.error.message.includes("QL_ITEM_TRADED")) {
          return json({ error: "Ein Item in diesem Tausch wurde schon an jemand anderen getauscht." }, 400);
        }
        throw result.error;
      }
      if (result.data.length === 0) continue; // jemand war schneller – neu laden
      return json({ row: next });
    }
    return json({ error: "Zu viele gleichzeitige Änderungen – bitte nochmal versuchen." }, 409);
  } catch (error) {
    if (error instanceof TradeError) return json({ error: error.message }, 400);
    console.error(error);
    return json({ error: "Interner Fehler im Tausch-Server." }, 500);
  }
});
