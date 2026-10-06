import { useMemo } from "react";
import type { Equipment } from "../domain/types";
import { getHeroGlowSprite, getHeroSprite } from "../game/heroSprite";
import { useGameStore } from "../store/gameStore";
import { GlowSprite, PixelSprite } from "./PixelSprite";

/**
 * Der Held als Pixel-Grafik mit sichtbarer Ausrüstung. Ohne `equipment` die
 * eigene, sonst z. B. die eines anderen Spielers (Rangliste, Profilseite).
 */
export function PixelAvatar({ size = 96, equipment }: { size?: number; equipment?: Equipment }) {
  const own = useGameStore((s) => s.equipment);
  const shown = equipment ?? own;
  const sprite = useMemo(() => getHeroSprite(shown), [shown]);
  // Boss-Items leuchten in ihren Rüstungsfarben.
  const glow = useMemo(() => getHeroGlowSprite(shown), [shown]);
  // Mit Umriss, damit auch schmale Waffen vor dunklem Hintergrund lesbar bleiben.
  if (!glow) return <PixelSprite sprite={sprite} size={size} />;
  return (
    <span className="relative inline-block isolate align-middle" style={{ width: size, height: size }}>
      <GlowSprite sprite={glow} size={size} />
      <PixelSprite sprite={sprite} size={size} className="relative" />
    </span>
  );
}
