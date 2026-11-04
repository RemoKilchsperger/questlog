// Item-Tausch zwischen zwei Spielern (docs/item-tausch.md). Reine Regeln ohne
// Server: was handelbar ist, ob ein Item von aussen echt aussieht, ob ein Angebot
// zum Spielstand passt, und wie ein abgeschlossener Tausch das Inventar ändert.
// Der Tausch-Server (Etappe 2) nutzt dieselben Funktionen.

import { MAX_UPGRADE, bonusValue, getItem, getRarity, hasItem, RARITIES } from "./items";
import { rollItemEffect, rollsEffect } from "./itemEffects";
import { rollWeaponAbilities } from "./abilities";
import type { OwnedItem, Rarity, StatKey, WeaponType } from "./types";

/** Ab diesem Level darf getauscht werden. */
export const TRADE_MIN_LEVEL = 10;
/** Höchstens so viele Items legt jeder Spieler in einen Tausch. */
export const TRADE_MAX_ITEMS = 6;
/** Höchstens so viele abgeschlossene Tausche pro Spieler und Tag (prüft der Server). */
export const TRADE_DAILY_LIMIT = 5;

const STAT_KEYS: readonly StatKey[] = ["strength", "intellect", "endurance", "charisma"];

/** Regelverstoss mit lesbarer Meldung für den Spieler. */
export class TradeError extends Error {}

/** Warum ein Item nicht getauscht werden kann – null = handelbar. Gesperrt sind Boss-Items und Unikate von Besuchern. */
export function tradeBlockReason(item: OwnedItem): string | null {
  const def = getItem(item.itemId);
  if (def.bossId) return "Boss-Items können nicht getauscht werden.";
  if (def.visitorId) return "Geschenke von Besuchern können nicht getauscht werden.";
  return null;
}

export const isTradeable = (item: OwnedItem) => tradeBlockReason(item) === null;

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Prüft ein Item, das von aussen kommt (Angebot des anderen Spielers, Cloud-Spielstand),
 * und gibt es bereinigt zurück. Es muss genau so aussehen, wie es als Drop entstanden
 * sein könnte: bekanntes Item, passende Boni, Effekt und Fähigkeiten aus der uid.
 * Wirft TradeError mit dem Grund.
 */
export function validateTradeItem(raw: unknown): OwnedItem {
  const fail = (why: string): never => {
    throw new TradeError(`Ungültiges Item: ${why}.`);
  };
  if (!raw || typeof raw !== "object") return fail("keine Daten");
  const item = raw as Record<string, unknown>;
  const { uid, itemId, rarity, bonuses, upgrade, effect, abilities } = item;

  if (typeof uid !== "string" || uid.length === 0 || uid.length > 64) return fail("uid fehlt");
  if (typeof itemId !== "string" || !hasItem(itemId)) return fail("unbekanntes Item");
  if (typeof rarity !== "string" || !RARITIES.some((r) => r.key === rarity)) return fail("unbekannte Seltenheit");
  const def = getItem(itemId);
  const owned = { uid, itemId, rarity: rarity as Rarity } as OwnedItem;
  const blocked = tradeBlockReason(owned);
  if (blocked) throw new TradeError(blocked);

  // Boni: genau `bonusCount` verschiedene Attribute, jedes mit der Höhe eines echten Drops
  if (!bonuses || typeof bonuses !== "object" || Array.isArray(bonuses)) return fail("Boni fehlen");
  const entries = Object.entries(bonuses as Record<string, unknown>);
  if (entries.length !== getRarity(owned.rarity).bonusCount) return fail("falsche Anzahl Boni");
  const expected = bonusValue(owned.rarity, def.requiredLevel);
  for (const [stat, value] of entries) {
    if (!STAT_KEYS.includes(stat as StatKey)) return fail("unbekanntes Attribut");
    if (value !== expected) return fail("Bonus zu hoch oder zu niedrig");
  }

  if (upgrade !== undefined && (!Number.isInteger(upgrade) || (upgrade as number) < 0 || (upgrade as number) > MAX_UPGRADE)) {
    return fail("falsche Verbesserungsstufe");
  }

  // Effekt und Fähigkeiten sind fest aus der uid gewürfelt – fehlen sie, werden sie ergänzt
  const rolledEffect = rollsEffect(def, owned.rarity) ? rollItemEffect(uid, def.kind) : undefined;
  if (effect !== undefined && effect !== rolledEffect) return fail("falscher Spezialeffekt");
  const rolledAbilities = def.kind === "weapon" ? rollWeaponAbilities(uid, def.type as WeaponType) : undefined;
  if (abilities !== undefined) {
    if (!rolledAbilities || !Array.isArray(abilities) || !sameList(abilities as string[], rolledAbilities)) {
      return fail("falsche Fähigkeiten");
    }
  }

  return {
    uid,
    itemId,
    rarity: owned.rarity,
    bonuses: Object.fromEntries(entries) as OwnedItem["bonuses"],
    ...(typeof upgrade === "number" && upgrade > 0 && { upgrade }),
    ...(rolledEffect && { effect: rolledEffect }),
    ...(rolledAbilities && { abilities: rolledAbilities }),
  };
}

/** Vergleich zweier Exemplare nach Inhalt (Reihenfolge der Boni egal, fehlende Stufe = 0). */
export function sameItem(a: OwnedItem, b: OwnedItem): boolean {
  const bonusesA = Object.entries(a.bonuses).sort(([x], [y]) => x.localeCompare(y));
  const bonusesB = Object.entries(b.bonuses).sort(([x], [y]) => x.localeCompare(y));
  return (
    a.uid === b.uid &&
    a.itemId === b.itemId &&
    a.rarity === b.rarity &&
    (a.upgrade ?? 0) === (b.upgrade ?? 0) &&
    JSON.stringify(bonusesA) === JSON.stringify(bonusesB)
  );
}

/**
 * Prüft ein Angebot gegen das Inventar des Anbieters (angelegte Items liegen nicht im
 * Inventar und sind damit ausgeschlossen). Gibt die geprüften Items zurück.
 */
export function checkOffer(inventory: readonly OwnedItem[], offer: readonly unknown[]): OwnedItem[] {
  if (offer.length > TRADE_MAX_ITEMS) throw new TradeError(`Höchstens ${TRADE_MAX_ITEMS} Items pro Tausch.`);
  const items = offer.map(validateTradeItem);
  const uids = new Set(items.map((i) => i.uid));
  if (uids.size !== items.length) throw new TradeError("Ein Item liegt doppelt im Angebot.");
  for (const item of items) {
    const owned = inventory.find((i) => i.uid === item.uid);
    if (!owned || !sameItem(owned, item)) throw new TradeError(`${getItem(item.itemId).name} liegt nicht mehr im Inventar.`);
  }
  return items;
}

/** Kann dieser Held tauschen? null = ja, sonst der Grund. */
export function tradeLockReason(level: number): string | null {
  return level < TRADE_MIN_LEVEL ? `Tauschen ist ab Level ${TRADE_MIN_LEVEL} möglich.` : null;
}

/**
 * Führt einen abgeschlossenen Tausch am eigenen Inventar aus: die abgegebenen Items
 * gehen weg, die erhaltenen kommen dazu. Wirft, wenn ein abgegebenes Item fehlt.
 */
export function applyTrade(inventory: readonly OwnedItem[], give: readonly OwnedItem[], receive: readonly OwnedItem[]): OwnedItem[] {
  const giveUids = new Set(give.map((i) => i.uid));
  for (const uid of giveUids) {
    if (!inventory.some((i) => i.uid === uid)) throw new TradeError("Ein abgegebenes Item fehlt im Inventar.");
  }
  const kept = inventory.filter((i) => !giveUids.has(i.uid));
  const keptUids = new Set(kept.map((i) => i.uid));
  return [...kept, ...receive.filter((i) => !keptUids.has(i.uid))];
}
