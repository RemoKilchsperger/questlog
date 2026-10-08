// Nur im Dev-Server (siehe main.tsx): Testhelden per Adresse anlegen.
//   ?dev=testheld  Level 60, alle Boss-Items (legendär), viel Gold, Essenz und Tränke
//   ?dev=zurueck   den Spielstand von vorher wiederherstellen
// Mit Cloud-Konto angemeldet geht es nicht: Der Testheld würde sonst hochgeladen
// und stünde in der öffentlichen Rangliste.

import { BOSS_ITEMS, createItem } from "../domain/items";
import { MAX_LEVEL, xpForNextLevel } from "../domain/leveling";
import { SAVE_KEY, useGameStore } from "../store/gameStore";

const BACKUP_KEY = "questlog-save-backup";

/** Angemeldet? Supabase legt die Sitzung unter "sb-<projekt>-auth-token" ab. */
function loggedIn(): boolean {
  return Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
}

export function runDevCommand() {
  const command = new URLSearchParams(window.location.search).get("dev");
  if (!command) return;
  // Befehl aus der Adresse nehmen, damit er beim Neuladen nicht nochmal läuft
  history.replaceState(null, "", window.location.pathname + window.location.hash);
  if (command !== "testheld" && command !== "zurueck") return;
  if (loggedIn()) {
    window.alert("Testheld: Bitte zuerst vom Cloud-Konto abmelden – sonst landet er online und in der Rangliste.");
    return;
  }
  if (command === "testheld") createTestHero();
  else restoreBackup();
}

function createTestHero() {
  // Den echten Spielstand nur beim ersten Mal sichern – nicht mit einem Testhelden überschreiben
  if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, localStorage.getItem(SAVE_KEY) ?? "");

  let totalXp = 0;
  for (let level = 1; level < MAX_LEVEL; level++) totalXp += xpForNextLevel(level);
  const bossItems = BOSS_ITEMS.map((def) => createItem(def.id, "legendary", crypto.randomUUID()));

  useGameStore.setState((s) => ({
    character: {
      ...s.character,
      name: s.character.name.includes("(Test)") ? s.character.name : `${s.character.name} (Test)`,
      totalXp,
      gold: 100_000,
      essence: 5_000,
    },
    inventory: [...s.inventory, ...bossItems],
    bossCollection: BOSS_ITEMS.map((def) => def.id),
    potions: { ...s.potions, small: 20, medium: 20, large: 20, attack: 10, armor: 10 },
  }));
  window.alert(
    `Testheld bereit: Level ${MAX_LEVEL}, alle ${BOSS_ITEMS.length} Boss-Items im Inventar.\n` +
      "Attribut- und Skillpunkte kannst du frei verteilen.\n" +
      "Zurück zum alten Spielstand: ?dev=zurueck",
  );
}

function restoreBackup() {
  const backup = localStorage.getItem(BACKUP_KEY);
  if (backup === null) {
    window.alert("Es gibt keinen gesicherten Spielstand.");
    return;
  }
  if (backup) localStorage.setItem(SAVE_KEY, backup);
  else localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(BACKUP_KEY);
  window.location.reload();
}
