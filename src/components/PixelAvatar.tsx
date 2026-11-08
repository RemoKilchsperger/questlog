import { useMemo } from "react";
import { DEFAULT_LOOKS, type HeroLooks } from "../domain/looks";
import type { Equipment } from "../domain/types";
import { getHeroGlowSprite, getHeroSprite } from "../game/heroSprite";
import { useGameStore } from "../store/gameStore";
import { GlowSprite, PixelSprite } from "./PixelSprite";

/**
 * Der Held als Pixel-Grafik mit sichtbarer Ausrüstung. Ohne `equipment` der
 * eigene, sonst z. B. der eines anderen Spielers (Rangliste, Profilseite) –
 * dann mit dessen `looks` bzw. dem Standardaussehen. Mit `looks` allein: der
 * eigene Held in einem anderen Aussehen (Vorschau der Charaktererstellung).
 */
export function PixelAvatar({ size = 96, equipment, looks }: { size?: number; equipment?: Equipment; looks?: HeroLooks }) {
  const ownEquipment = useGameStore((s) => s.equipment);
  const ownLooks = useGameStore((s) => s.character.looks);
  const shown = equipment ?? ownEquipment;
  const face = looks ?? (equipment ? undefined : ownLooks) ?? DEFAULT_LOOKS;
  const sprite = useMemo(() => getHeroSprite(shown, { looks: face }), [shown, face]);
  // Boss-Items leuchten in ihren Rüstungsfarben.
  const glow = useMemo(() => getHeroGlowSprite(shown, { looks: face }), [shown, face]);
  // Mit Umriss, damit auch schmale Waffen vor dunklem Hintergrund lesbar bleiben.
  if (!glow) return <PixelSprite sprite={sprite} size={size} />;
  return (
    <span className="relative inline-block isolate align-middle" style={{ width: size, height: size }}>
      <GlowSprite sprite={glow} size={size} />
      <PixelSprite sprite={sprite} size={size} className="relative" />
    </span>
  );
}
