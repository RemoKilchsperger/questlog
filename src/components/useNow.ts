import { useEffect, useState } from "react";

/** Aktuelle Uhrzeit, alle 30 Sekunden aktualisiert – für Countdowns und regelmässige Wechsel. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
