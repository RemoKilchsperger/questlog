import { useMemo } from "react";
import type { Equipment } from "../domain/types";
import { getHeroSprite } from "../game/heroSprite";
import { useGameStore } from "../store/gameStore";
import { PixelSprite } from "./PixelSprite";

/**
 * Der Held als Pixel-Grafik mit sichtbarer Ausrüstung. Ohne `equipment` die
 * eigene, sonst z. B. die eines anderen Spielers (Rangliste, Profilseite).
 */
export function PixelAvatar({ size = 96, equipment }: { size?: number; equipment?: Equipment }) {
  const own = useGameStore((s) => s.equipment);
  const shown = equipment ?? own;
  const sprite = useMemo(() => getHeroSprite(shown), [shown]);
  // Mit Umriss, damit auch schmale Waffen vor dunklem Hintergrund lesbar bleiben.
  return <PixelSprite sprite={sprite} size={size} />;
}
