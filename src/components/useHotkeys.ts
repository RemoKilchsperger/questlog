import { useEffect, useLayoutEffect, useRef } from "react";

/** Tasten für die Fähigkeiten (in Reihenfolge der Knöpfe) */
export const ABILITY_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
/** Tasten für die Tränke (die ersten vier in der Leiste) */
export const POTION_KEYS = ["q", "w", "e", "r"];

/** Tippt der Spieler gerade in ein Feld? Dann gehören die Tasten dem Feld. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Tastenkürzel, solange die Komponente steht. `handler` bekommt die Taste klein
 * geschrieben und meldet mit `true`, dass sie verbraucht wurde.
 * Gedrückte Modifikatoren, gehaltene Tasten und Eingabefelder werden ignoriert.
 */
export function useHotkeys(handler: (key: string) => boolean, enabled = true) {
  // Immer der neueste Handler – so muss der Listener nicht bei jedem Render neu hängen
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (latest.current(e.key.toLowerCase())) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
