// Wiederkehrende Quests und Serien.
//
// Eine wiederkehrende Quest bleibt im Questlog stehen. `dueDate` ist immer der
// nächste Termin: Ist er erreicht, kann man sie erledigen – danach springt er
// auf den folgenden Termin, und unter „Erledigt“ landet ein Eintrag.
//
// Serie: Wer einen Termin pünktlich (am Tag selbst) erledigt, verlängert die
// Serie um 1. Ist der Termin schon verstrichen, beginnt sie wieder bei 1.
// Jede Stufe über 1 gibt +5 % XP und Gold, höchstens +50 %.

import type { Quest } from "./types";

export type Recurrence =
  | { kind: "daily" }
  /** Wochentage: 0 = Montag … 6 = Sonntag */
  | { kind: "weekdays"; days: number[] }
  | { kind: "interval"; every: number };

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const STREAK_STEP = 0.05;
export const STREAK_MAX_BONUS = 0.5;
export const MAX_INTERVAL = 30;

/* ───────────── Datumsrechnung (lokale Tage als "yyyy-mm-dd") ───────────── */

function parse(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function format(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(key: string, days: number): string {
  const date = parse(key);
  date.setDate(date.getDate() + days);
  return format(date);
}

/** Wochentag eines Datums: 0 = Montag … 6 = Sonntag. */
export function weekday(key: string): number {
  return (parse(key).getDay() + 6) % 7;
}

/* ───────────── Termine ───────────── */

/** Ist eine Wiederholung gültig? (mindestens ein Wochentag, Abstand 1–30 Tage) */
export function isValidRecurrence(r: Recurrence): boolean {
  if (r.kind === "weekdays") return r.days.length > 0 && r.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (r.kind === "interval") return Number.isInteger(r.every) && r.every >= 1 && r.every <= MAX_INTERVAL;
  return true;
}

/** Erster Termin ab heute (heute eingeschlossen). */
export function firstDue(r: Recurrence, today: string): string {
  if (r.kind === "weekdays") {
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i);
      if (r.days.includes(weekday(day))) return day;
    }
  }
  return today;
}

/** Nächster Termin nach dem Tag `after` (nicht eingeschlossen). */
export function nextDue(r: Recurrence, after: string): string {
  if (r.kind === "daily") return addDays(after, 1);
  if (r.kind === "interval") return addDays(after, r.every);
  return firstDue(r, addDays(after, 1));
}

/** Lesbarer Rhythmus: „Täglich“, „Mo, Mi, Fr“, „Alle 3 Tage“. */
export function recurrenceLabel(r: Recurrence): string {
  if (r.kind === "daily") return "Täglich";
  if (r.kind === "interval") return r.every === 1 ? "Täglich" : r.every === 7 ? "Wöchentlich" : `Alle ${r.every} Tage`;
  const days = [...r.days].sort((a, b) => a - b);
  if (days.length === 7) return "Täglich";
  if (days.join() === "0,1,2,3,4") return "Werktags";
  if (days.join() === "5,6") return "Am Wochenende";
  return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

/* ───────────── Zustand einer wiederkehrenden Quest ───────────── */

/** Schon für den aktuellen Termin erledigt – wartet auf den nächsten. */
export function isWaiting(quest: Quest, today: string): boolean {
  return quest.recurrence !== undefined && quest.dueDate !== undefined && quest.dueDate > today;
}

/** Der Termin ist verstrichen – die Serie ist gerissen. */
export function isMissed(quest: Quest, today: string): boolean {
  return quest.recurrence !== undefined && quest.dueDate !== undefined && quest.dueDate < today;
}

/** Aktuelle Serie, wie sie gerade zählt (0, wenn ein Termin verpasst wurde). */
export function currentStreak(quest: Quest, today: string): number {
  return isMissed(quest, today) ? 0 : (quest.streak ?? 0);
}

/** Serie nach dem Erledigen heute: pünktlich +1, sonst Neustart bei 1. */
export function streakAfterCompletion(quest: Quest, today: string): number {
  return isMissed(quest, today) ? 1 : (quest.streak ?? 0) + 1;
}

/** Bonus auf XP und Gold für eine Serie: +5 % pro Stufe über 1, höchstens +50 %. */
export function streakBonus(streak: number): number {
  return Math.min(STREAK_MAX_BONUS, Math.max(0, streak - 1) * STREAK_STEP);
}

/**
 * Erledigt eine wiederkehrende Quest heute: die Quest selbst mit neuer Serie
 * und nächstem Termin – die Belohnung berechnet der Aufrufer mit `streak`.
 */
export function advanceRecurring(quest: Quest, today: string): { next: Quest; streak: number } {
  if (!quest.recurrence) throw new Error("Keine wiederkehrende Quest.");
  if (isWaiting(quest, today)) throw new Error("Diese Quest ist erst wieder am nächsten Termin fällig.");
  const streak = streakAfterCompletion(quest, today);
  return {
    streak,
    next: {
      ...quest,
      streak,
      bestStreak: Math.max(quest.bestStreak ?? 0, streak),
      lastDone: today,
      dueDate: nextDue(quest.recurrence, today),
    },
  };
}
