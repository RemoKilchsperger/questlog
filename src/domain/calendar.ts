// Zeitabschnitte für alles, was regelmässig wechselt (Tages- und Wochenaufträge, Händler).
// Alles in Ortszeit, damit Wechsel zu „runden“ Uhrzeiten passieren.

/** Lokales Datum als "yyyy-mm-dd". */
export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Tage seit 1970 nach lokalem Datum (unabhängig von Zeitzone und Sommerzeit). */
export function localDayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Fortlaufende Nummer des Abschnitts von `hours` Stunden (ab Mitternacht gezählt). */
export function slotIndex(date: Date, hours: number): number {
  return localDayNumber(date) * Math.floor(24 / hours) + Math.floor(date.getHours() / hours);
}

/** Beginn des nächsten Abschnitts von `hours` Stunden (ab Mitternacht gezählt). */
export function nextBoundary(now: Date, hours: number): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), (Math.floor(now.getHours() / hours) + 1) * hours);
  return next;
}

/** Montag der Woche als "yyyy-mm-dd" – Wochenaufträge wechseln montags um Mitternacht. */
export function weekKey(date: Date = new Date()): string {
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)));
}

/** Beginn der nächsten Woche: Montag, 0 Uhr. */
export function nextWeekStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7);
}

/** "3 Std 12 Min" bis zu einem Zeitpunkt – ab einem Tag "2 T 5 Std". */
export function formatCountdown(now: Date, target: Date): string {
  const minutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)} T ${hours % 24} Std`;
  return `${hours} Std ${minutes % 60} Min`;
}
