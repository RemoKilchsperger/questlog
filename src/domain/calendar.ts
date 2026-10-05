// Zeitabschnitte für alles, was regelmässig wechselt (Bonusquests, Händler).
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

/** "3 Std 12 Min" bis zu einem Zeitpunkt. */
export function formatCountdown(now: Date, target: Date): string {
  const minutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)} Std ${minutes % 60} Min`;
}
