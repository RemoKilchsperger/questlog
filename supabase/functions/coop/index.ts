// Edge Function "coop": die einzige Stelle, die Koop-Kämpfe schreibt
// (Etappe 2 aus docs/koop-kampf.md). Ablauf pro Anfrage:
//   1. Anmeldung prüfen (JWT des Spielers)
//   2. Kampf laden, Kampfwerte aus den Cloud-Spielständen berechnen
//   3. Befehl mit der gemeinsamen Spiellogik anwenden (_shared/coop-server.js)
//   4. Speichern – nur, wenn niemand dazwischen geändert hat (Versionsprüfung),
//      sonst neu laden und nochmal versuchen
//
// Die Spiellogik kommt gebündelt aus src/coop/edge.ts: `npm run functions:build`.
// Deploy: `npm run functions:deploy -- --project-ref <ref>`

import { createClient } from "npm:@supabase/supabase-js@2";
import { applyCommand, COOP_ROW_TTL_HOURS, CoopError, memberFromSave, newLobbyCode } from "../_shared/coop-server.js";

// Schlanke Typen für diese Datei – die vollständigen stehen in src/coop/protocol.ts.
type CoopCommand = { type: "create" | "ready" | "leave" | "start" | "act" | "tick" | "next" | "exit" } | { type: "join"; code: string };
type CoopRow = { id: string; version: number; player_ids: string[] };
type CoopMember = { id: string };

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

/** Teilnehmer mit Kampfwerten aus seinem Cloud-Spielstand. */
async function loadMember(userId: string): Promise<CoopMember> {
  const [save, profile] = await Promise.all([
    admin.from("saves").select("data").eq("user_id", userId).maybeSingle(),
    admin.from("public_profiles").select("username").eq("user_id", userId).maybeSingle(),
  ]);
  if (save.error) throw save.error;
  return memberFromSave(userId, save.data?.data ?? null, (profile.data?.username as string | undefined) ?? null);
}

async function loadRow(command: CoopCommand, id: string | undefined): Promise<CoopRow | null> {
  if (command.type === "create") return null;
  const query = admin.from("coop_battles").select("*");
  const result =
    command.type === "join"
      ? await query.eq("code", String(command.code).toUpperCase()).maybeSingle()
      : await query.eq("id", id ?? "").maybeSingle();
  if (result.error) throw result.error;
  return (result.data as CoopRow | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Nicht angemeldet." }, 401);
    const userId = auth.user.id;
    const { command, id } = (await req.json()) as { command: CoopCommand; id?: string };

    // Alte Kämpfe aufräumen, damit die Tabelle nicht endlos wächst
    if (command.type === "create") {
      const cutoff = new Date(Date.now() - COOP_ROW_TTL_HOURS * 3600_000).toISOString();
      await admin.from("coop_battles").delete().lt("updated_at", cutoff);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await loadRow(command, id);
      const needsMember = command.type === "create" || command.type === "join" || command.type === "ready";
      const member = needsMember ? await loadMember(userId) : null;
      const members =
        command.type === "start" && row
          ? Object.fromEntries(await Promise.all(row.player_ids.map(async (pid) => [pid, await loadMember(pid)] as const)))
          : undefined;
      const now = Date.now();
      const next = applyCommand(row, command, {
        userId,
        now,
        rng: Math.random,
        member,
        members,
        newId: () => crypto.randomUUID(),
        newCode: () => newLobbyCode(),
      });

      if (next === row) return json({ row, serverNow: now });
      if (!row) {
        const insert = await admin.from("coop_battles").insert(next);
        if (insert.error?.code === "23505") continue; // Code schon vergeben – neuer Versuch
        if (insert.error) throw insert.error;
        return json({ row: next, serverNow: now });
      }
      const write = next
        ? admin.from("coop_battles").update(next).eq("id", row.id).eq("version", row.version).select("id")
        : admin.from("coop_battles").delete().eq("id", row.id).eq("version", row.version).select("id");
      const result = await write;
      if (result.error) throw result.error;
      if (result.data.length === 0) continue; // jemand war schneller – neu laden
      return json({ row: next, serverNow: now });
    }
    return json({ error: "Zu viele gleichzeitige Änderungen – bitte nochmal versuchen." }, 409);
  } catch (error) {
    if (error instanceof CoopError) return json({ error: error.message }, 400);
    console.error(error);
    return json({ error: "Interner Fehler im Koop-Server." }, 500);
  }
});
