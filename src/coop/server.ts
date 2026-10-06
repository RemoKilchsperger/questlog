// Server-Logik des Koop-Kampfs (Etappe 2): Befehle auf einen Kampf-Datensatz
// anwenden. Rein und ohne Datenbank – die Edge Function (supabase/functions/coop)
// lädt und speichert, der lokale Testmodus nutzt dieselbe Logik im Browser.
//
// Der Server ist die einzige Instanz, die Runden auflöst. Die Kampfwerte der
// Helden berechnet er selbst aus dem Cloud-Spielstand (`memberFromSave`) –
// was ein Client über sich behauptet, zählt nicht.

import { getHeroCombatProfile } from "../domain/combat";
import {
  COOP_MAX_PLAYERS,
  COOP_MIN_PLAYERS,
  getCoopBoss,
  resolveRound,
  startCoopBattle,
} from "../domain/coopCombat";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import { getLevel } from "../domain/leveling";
import type { Character, Equipment } from "../domain/types";
import type { CoopCommand, CoopMember, CoopRow } from "./protocol";

/** Fehler, die der Spieler sehen soll (z. B. „Die Lobby ist voll.“). */
export class CoopError extends Error {}

export interface ServerContext {
  userId: string;
  now: number;
  rng: () => number;
  /** Frische Daten des handelnden Spielers (aus seinem Cloud-Spielstand) */
  member: CoopMember | null;
  /** Beim Start: frische Daten aller Teilnehmer */
  members?: Record<string, CoopMember>;
  newId: () => string;
  newCode: () => string;
}

/** Abgeschlossene oder verlassene Kämpfe räumt der Server nach dieser Zeit weg. */
export const COOP_ROW_TTL_HOURS = 24;

/**
 * Teilnehmer aus einem gespeicherten Spielstand (Inhalt von localStorage
 * "questlog-save" bzw. saves.data). Fehlende Felder älterer Stände werden
 * mit neutralen Werten ergänzt.
 */
export function memberFromSave(id: string, save: unknown, username: string | null): CoopMember {
  const state = (save as { state?: { character?: Partial<Character>; equipment?: Partial<Equipment> } } | null)?.state;
  if (!state?.character) throw new CoopError("Kein Cloud-Spielstand gefunden – bitte einmal online speichern.");
  const raw = state.character;
  const character: Character = {
    name: raw.name ?? "Held",
    totalXp: raw.totalXp ?? 0,
    gold: raw.gold ?? 0,
    essence: raw.essence ?? 0,
    stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1, ...raw.stats },
    spentPoints: raw.spentPoints ?? 0,
    battlePoints: raw.battlePoints ?? 0,
    battlePointSlot: raw.battlePointSlot ?? 0,
    skills: raw.skills ?? {},
    abilities: raw.abilities ?? [],
  };
  const equipment: Equipment = { ...EMPTY_EQUIPMENT, ...state.equipment };
  return {
    id,
    name: character.name,
    username,
    level: getLevel(character.totalXp),
    equipment,
    profile: getHeroCombatProfile(character, equipment),
    ready: false,
  };
}

/** Ist dieser Spieler Teil des Kampfs? */
export function isParticipant(row: CoopRow, userId: string): boolean {
  return row.player_ids.includes(userId);
}

/**
 * Wendet einen Befehl an. Gibt den neuen Datensatz zurück – unverändert, wenn
 * es nichts zu tun gibt, null, wenn die Lobby aufgelöst ist. Ungültiges wirft
 * einen CoopError.
 */
export function applyCommand(row: CoopRow | null, command: CoopCommand, ctx: ServerContext): CoopRow | null {
  if (command.type === "create") return create(command.bossId, ctx);
  if (!row) throw new CoopError("Diese Lobby gibt es nicht mehr.");
  if (command.type === "join") return join(row, ctx);
  if (!isParticipant(row, ctx.userId)) throw new CoopError("Du bist nicht Teil dieses Kampfs.");

  switch (command.type) {
    case "ready":
      return ready(row, command.ready, ctx);
    case "leave":
      return leave(row, ctx);
    case "start":
      return start(row, ctx);
    case "act":
      return act(row, command.round, command.action, ctx);
    case "tick":
      return tick(row, ctx);
  }
}

function touch(row: CoopRow, changes: Partial<CoopRow>, ctx: ServerContext): CoopRow {
  return { ...row, ...changes, version: row.version + 1, updated_at: new Date(ctx.now).toISOString() };
}

function create(bossId: string, ctx: ServerContext): CoopRow {
  getCoopBoss(bossId); // wirft bei unbekanntem Boss
  if (!ctx.member) throw new CoopError("Kein Cloud-Spielstand gefunden.");
  if (ctx.member.level < getCoopBoss(bossId).level) {
    throw new CoopError(`${getCoopBoss(bossId).name} ist erst ab Level ${getCoopBoss(bossId).level} zugänglich.`);
  }
  return {
    id: ctx.newId(),
    code: ctx.newCode(),
    host_id: ctx.userId,
    boss_id: bossId,
    phase: "lobby",
    members: [{ ...ctx.member, ready: true }],
    player_ids: [ctx.userId],
    state: null,
    actions: {},
    last_events: [],
    version: 1,
    updated_at: new Date(ctx.now).toISOString(),
  };
}

function join(row: CoopRow, ctx: ServerContext): CoopRow {
  const known = isParticipant(row, ctx.userId);
  if (row.phase !== "lobby") {
    // Wer schon dabei ist, darf jederzeit zurück – den Stand bekommt er so oder so.
    if (known) return row.members.find((m) => m.id === ctx.userId)?.left ? markLeft(row, ctx.userId, false, ctx) : row;
    throw new CoopError("Der Kampf läuft bereits.");
  }
  if (!ctx.member) throw new CoopError("Kein Cloud-Spielstand gefunden.");
  if (known) {
    return touch(row, { members: row.members.map((m) => (m.id === ctx.userId ? { ...ctx.member!, ready: m.ready } : m)) }, ctx);
  }
  if (row.members.length >= COOP_MAX_PLAYERS) throw new CoopError("Die Lobby ist voll.");
  return touch(row, { members: [...row.members, { ...ctx.member, ready: false }], player_ids: [...row.player_ids, ctx.userId] }, ctx);
}

function ready(row: CoopRow, isReady: boolean, ctx: ServerContext): CoopRow {
  if (row.phase !== "lobby") return row;
  const fresh = ctx.member;
  return touch(row, { members: row.members.map((m) => (m.id === ctx.userId ? { ...(fresh ?? m), ready: isReady } : m)) }, ctx);
}

function markLeft(row: CoopRow, userId: string, left: boolean, ctx: ServerContext): CoopRow {
  return touch(row, { members: row.members.map((m) => (m.id === userId ? { ...m, left } : m)) }, ctx);
}

function leave(row: CoopRow, ctx: ServerContext): CoopRow | null {
  if (row.phase === "lobby") {
    const members = row.members.filter((m) => m.id !== ctx.userId);
    if (members.length === 0) return null;
    // Geht der Host, übernimmt der nächste – er muss nicht mehr „bereit“ klicken.
    const hostId = row.host_id === ctx.userId ? members[0].id : row.host_id;
    return touch(
      row,
      {
        host_id: hostId,
        members: members.map((m) => (m.id === hostId ? { ...m, ready: true } : m)),
        player_ids: row.player_ids.filter((id) => id !== ctx.userId),
      },
      ctx,
    );
  }
  if (row.phase === "finished") return row;
  // Im Kampf bleibt der Held stehen und greift automatisch an.
  const next = markLeft(row, ctx.userId, true, ctx);
  return maybeResolve(next, ctx);
}

function start(row: CoopRow, ctx: ServerContext): CoopRow {
  if (row.host_id !== ctx.userId) throw new CoopError("Nur der Host kann den Kampf starten.");
  if (row.phase !== "lobby") return row;
  if (row.members.length < COOP_MIN_PLAYERS) throw new CoopError(`Es braucht mindestens ${COOP_MIN_PLAYERS} Spieler.`);
  if (row.members.some((m) => m.id !== row.host_id && !m.ready)) throw new CoopError("Noch nicht alle sind bereit.");
  // Werte frisch aus den Cloud-Spielständen, damit niemand mit veralteten (oder geschönten) Werten antritt
  const members = row.members.map((m) => ({ ...(ctx.members?.[m.id] ?? m), ready: true }));
  const state = startCoopBattle(
    ctx.newId(),
    row.boss_id,
    members.map((m) => ({ id: m.id, name: m.name, profile: m.profile })),
    ctx.now,
  );
  return touch(row, { phase: "battle", members, state, actions: {}, last_events: [] }, ctx);
}

function act(row: CoopRow, round: number, action: CoopRow["actions"][string], ctx: ServerContext): CoopRow {
  const state = row.state;
  if (row.phase !== "battle" || !state || state.status !== "active") return row;
  if (round !== state.round) return row; // veralteter Klick aus der letzten Runde
  const hero = state.heroes.find((h) => h.id === ctx.userId);
  if (!hero || hero.down || ctx.userId in row.actions) return row;
  const next = touch(row, { actions: { ...row.actions, [ctx.userId]: action } }, ctx);
  return maybeResolve(next, ctx);
}

function tick(row: CoopRow, ctx: ServerContext): CoopRow {
  if (row.phase !== "battle" || !row.state || row.state.status !== "active") return row;
  return ctx.now >= row.state.deadline ? resolve(row, ctx) : row;
}

/** Sobald alle lebenden, anwesenden Helden gewählt haben, wird sofort aufgelöst. */
function maybeResolve(row: CoopRow, ctx: ServerContext): CoopRow {
  const state = row.state;
  if (row.phase !== "battle" || !state || state.status !== "active") return row;
  const away = new Set(row.members.filter((m) => m.left).map((m) => m.id));
  // Eingefrorene setzen ohnehin aus – auf sie wird nicht gewartet
  const waiting = state.heroes.filter((h) => !h.down && !h.effects.frozen && !away.has(h.id) && !(h.id in row.actions));
  return waiting.length === 0 ? resolve(row, ctx) : row;
}

function resolve(row: CoopRow, ctx: ServerContext): CoopRow {
  const result = resolveRound(row.state!, row.actions, ctx.rng, ctx.now);
  return touch(
    row,
    {
      state: result.state,
      last_events: result.events,
      actions: {},
      phase: result.state.status === "active" ? "battle" : "finished",
    },
    ctx,
  );
}
