import { useEffect, useState } from "react";

/** Aktuelle Uhrzeit, standardmässig alle 30 Sekunden aktualisiert – für Countdowns und regelmässige Wechsel. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
