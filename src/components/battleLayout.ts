import { useEffect, useRef } from "react";

/**
 * Rahmen der Kampfszene (solo und Koop): volle Breite im Verhältnis 9:4 – auf niedrigen
 * Bildschirmen (Laptop) aber nur so hoch, dass darunter Zustand, Angreifen und die
 * Fähigkeiten noch ohne Scrollen Platz haben. Die Szene wird dann schmaler und steht mittig.
 */
export const SCENE_FRAME = "mx-auto aspect-[9/4] w-full max-w-[max(20rem,calc((100dvh_-_22rem)*9/4))]";

/**
 * Bringt den Kampf nach oben, sobald er beginnt (und bei jedem weiteren Kampf eines Laufs) –
 * so nehmen Logo, Anzeige und Tabs darüber den Knöpfen keinen Platz weg.
 */
export function useScrollToBattle<T extends HTMLElement>(battleId: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [battleId]);
  return ref;
}
