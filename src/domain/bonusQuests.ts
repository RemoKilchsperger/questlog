// Tägliche Bonusquests: vorgegebene Aufgaben mit besserer Belohnung
// (siehe BONUS_MULTIPLIER in rewards.ts). Jeden Tag gibt es pro Aufwandsstufe
// genau eine. Die Auswahl hängt nur vom Datum ab – sie ist also den ganzen
// Tag gleich, braucht keinen Speicher und könnte später 1:1 auf dem Server laufen.

import { hash, seededRng } from "./random";
import { EFFORT_TIERS } from "./rewards";
import type { Category, Effort } from "./types";

export interface BonusQuest {
  /** Stabil, solange die Listen unten nur ergänzt werden: "<Aufwand>-<Kategorie>-<Nr>" */
  id: string;
  title: string;
  effort: Effort;
  category: Category;
}

/** 25 Bonusquests pro Aufwandsstufe, nach Kategorie sortiert. Neue Einträge immer hinten anhängen. */
const POOL: Record<Effort, Record<Category, readonly string[]>> = {
  quick: {
    body: [
      "10 Liegestütze machen",
      "Ein grosses Glas Wasser trinken",
      "5 Minuten dehnen",
      "Heute konsequent Treppe statt Lift nehmen",
      "1 Minute Plank halten",
      "20 Kniebeugen machen",
      "Kurz an die frische Luft gehen",
    ],
    mind: [
      "Eine Seite in einem Buch lesen",
      "10 Vokabeln einer Fremdsprache lernen",
      "Drei Dinge aufschreiben, für die du dankbar bist",
      "5 Minuten meditieren",
      "Einen Wikipedia-Artikel über etwas Neues lesen",
      "Ein Rätsel oder Sudoku lösen",
    ],
    daily: [
      "Bett machen",
      "Spülmaschine ein- oder ausräumen",
      "Schreibtisch aufräumen",
      "Pflanzen giessen",
      "Müll und Altpapier rausbringen",
      "Kühlschrank auf Abgelaufenes prüfen",
    ],
    social: [
      "Jemandem ein ehrliches Kompliment machen",
      "Einer befreundeten Person eine liebe Nachricht schicken",
      "Jemandem ausdrücklich für etwas danken",
      "Der Familie ein Foto vom Tag schicken",
      "Jemanden aus der Nachbarschaft grüssen und kurz plaudern",
      "Auf eine liegengebliebene Nachricht antworten",
    ],
  },
  short: {
    body: [
      "20 Minuten spazieren gehen",
      "Kurzes Workout (20 Minuten)",
      "Eine Yoga-Session machen",
      "Eine Besorgung zu Fuss oder mit dem Velo erledigen",
      "Ein gesundes Essen selbst zubereiten",
      "15 Minuten Seilspringen oder Intervalltraining",
      "Faszienrolle und Mobility-Übungen",
    ],
    mind: [
      "30 Minuten in einem Buch lesen",
      "Ein Lernvideo zu einem neuen Thema schauen",
      "Tagebuch schreiben",
      "Eine Podcast-Folge hören und 3 Erkenntnisse notieren",
      "30 Minuten mit einer Sprach-App lernen",
      "Ein Problem aufschreiben und Lösungen sammeln",
    ],
    daily: [
      "Wäsche waschen und aufhängen",
      "Badezimmer putzen",
      "Einkaufsliste schreiben und einkaufen gehen",
      "Die Wohnung staubsaugen",
      "E-Mail-Posteingang auf null bringen",
      "Wochenplan für die nächsten Tage erstellen",
    ],
    social: [
      "Mit einer befreundeten Person telefonieren",
      "Mit jemandem einen Kaffee trinken",
      "Jemandem bei einer Aufgabe helfen",
      "Eine Postkarte oder einen Brief schreiben",
      "Gemeinsam mit der Familie oder Mitbewohnern essen",
      "Jemanden ehrlich fragen, wie es geht – und zuhören",
    ],
  },
  medium: {
    body: [
      "1 Stunde wandern",
      "Krafttraining im Gym",
      "5 km joggen",
      "Schwimmen gehen",
      "Eine Stunde Velo fahren",
      "Gesundes Essen für die nächsten Tage vorkochen",
      "Einen Sportkurs besuchen",
    ],
    mind: [
      "Eine Stunde konzentriert an einem Lernprojekt arbeiten",
      "Ein Kapitel eines Fachbuchs durcharbeiten",
      "Ein Modul eines Online-Kurses abschliessen",
      "Eine Stunde ein Instrument üben",
      "Einen Text oder Blogartikel schreiben",
      "Ein Programmier- oder Bastelprojekt vorantreiben",
    ],
    daily: [
      "Küche gründlich putzen",
      "Kleiderschrank ausmisten",
      "Finanzen prüfen und Budget aktualisieren",
      "Liegengebliebenen Papierkram erledigen",
      "Fenster putzen",
      "Eine Reparatur erledigen, die schon lange ansteht",
    ],
    social: [
      "Freunde zu einem Spieleabend einladen",
      "Jemanden besuchen, den du länger nicht gesehen hast",
      "Für jemanden kochen",
      "An einem Vereins- oder Gruppentreffen teilnehmen",
      "Ein langes Gespräch mit einem Familienmitglied führen",
      "Ein Geschenk für jemanden besorgen oder basteln",
    ],
  },
  long: {
    body: [
      "2 Stunden wandern",
      "10 km laufen",
      "Eine lange Velotour machen",
      "Ausgiebig trainieren: Kraft und Ausdauer",
      "Klettern oder Bouldern gehen",
      "Mit anderen ein Sportspiel spielen (Fussball, Badminton …)",
      "Garten oder Balkon gründlich in Schuss bringen",
    ],
    mind: [
      "Zwei Stunden Deep Work an einem wichtigen Projekt",
      "Ein Museum oder eine Ausstellung besuchen",
      "Eine Kurslektion samt Übungen komplett abschliessen",
      "Ein Buch zu Ende lesen",
      "Eine Präsentation oder einen Vortrag vorbereiten",
      "Etwas Neues bauen, malen oder komponieren",
    ],
    daily: [
      "Die ganze Wohnung putzen",
      "Keller, Estrich oder Abstellraum aufräumen",
      "Steuererklärung oder grösseren Papierkram angehen",
      "Grosseinkauf machen und Vorräte auffüllen",
      "Digitale Ablage aufräumen und ein Backup machen",
      "Möbel aufbauen oder umstellen",
    ],
    social: [
      "Einen Ausflug mit Freunden machen",
      "Ein Essen für mehrere Gäste ausrichten",
      "Zwei Stunden ehrenamtlich helfen",
      "Ein Familientreffen organisieren",
      "Mit jemandem ein gemeinsames Projekt vorantreiben",
      "Einen Abend mit einer nahestehenden Person planen und geniessen",
    ],
  },
  epic: {
    body: [
      "Eine Tageswanderung machen",
      "An einem Lauf-Wettkampf teilnehmen",
      "Eine Velotour über 50 km fahren",
      "Einen ganzen Tag Winter- oder Wassersport",
      "Einen Berg besteigen",
      "Bei einem Sportturnier mitmachen",
      "Einen ganzen Tag bewusst gesund leben: Sport, gutes Essen, früh schlafen",
    ],
    mind: [
      "Einen ganztägigen Kurs oder Workshop besuchen",
      "Ein eigenes Projekt fertigstellen und veröffentlichen",
      "Bei einem Hackathon oder Game Jam mitmachen",
      "Ein ganzes Buch an einem Tag lesen",
      "Einen halben Tag intensiv eine neue Fähigkeit üben",
      "Eine Prüfung ablegen oder einen Tag intensiv dafür lernen",
    ],
    daily: [
      "Frühjahrsputz in der ganzen Wohnung",
      "Eine grosse Umräum- oder Umzugsaktion stemmen",
      "Ein Zimmer renovieren oder streichen",
      "Den ganzen Haushalt ausmisten und Aussortiertes spenden",
      "Alle offenen Rechnungen und Behördensachen erledigen",
      "Mahlzeiten für die ganze Woche vorkochen",
    ],
    social: [
      "Ein Fest oder eine Party organisieren",
      "Einen Tagesausflug mit der Familie machen",
      "Einen ganzen Tag ehrenamtlich helfen",
      "Jemanden in einer anderen Stadt besuchen",
      "Ein Treffen oder einen Event für eine Gruppe organisieren",
      "Jemandem einen ganzen Tag bei einem Umzug oder Projekt helfen",
    ],
  },
};

const CATEGORY_ORDER: readonly Category[] = ["body", "mind", "daily", "social"];

const questsFor = (effort: Effort): BonusQuest[] =>
  CATEGORY_ORDER.flatMap((category) =>
    POOL[effort][category].map((title, i) => ({ id: `${effort}-${category}-${i}`, title, effort, category })),
  );

/** Alle Bonusquests einer Aufwandsstufe. */
export const BONUS_QUESTS: Record<Effort, readonly BonusQuest[]> = {
  quick: questsFor("quick"),
  short: questsFor("short"),
  medium: questsFor("medium"),
  long: questsFor("long"),
  epic: questsFor("epic"),
};

/** Tage seit 1970 für ein "yyyy-mm-dd" (unabhängig von Zeitzone und Sommerzeit). */
function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Gemischte Reihenfolge aller Quests einer Stufe für einen Durchgang (Fisher-Yates). */
function shuffledOrder(effort: Effort, cycle: number): number[] {
  const rng = seededRng(hash(`bonus|${effort}|${cycle}`));
  const order = BONUS_QUESTS[effort].map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Jede Stufe geht ihre Quests in gemischter Reihenfolge durch: in einem
 * Durchgang (25 Tage) kommt jede genau einmal dran. Damit es auch an der
 * Grenze zweier Durchgänge keine Wiederholung gibt, werden notfalls die
 * ersten beiden Tage des neuen Durchgangs getauscht.
 */
function pickIndex(effort: Effort, day: string): number {
  const length = BONUS_QUESTS[effort].length;
  const n = dayNumber(day);
  const cycle = Math.floor(n / length);
  const order = shuffledOrder(effort, cycle);
  const lastOfPrevious = shuffledOrder(effort, cycle - 1)[length - 1];
  if (order[0] === lastOfPrevious) [order[0], order[1]] = [order[1], order[0]];
  return order[n - cycle * length];
}

/** Die Bonusquests eines Tages: je eine für Schnell, Kurz, Mittel, Lang und Episch. */
export function getDailyBonusQuests(day: string): BonusQuest[] {
  return EFFORT_TIERS.map(({ key }) => BONUS_QUESTS[key][pickIndex(key, day)]);
}
