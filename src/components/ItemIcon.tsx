import type { ItemDef, Rarity } from "../domain/types";
import { getItemSprite } from "../game/itemSprites";
import { PixelSprite } from "./PixelSprite";

const GLOW: Record<Rarity, string> = {
  common: "",
  rare: "glow-rare",
  epic: "glow-epic",
  legendary: "glow-legendary",
};

/** Funkelnde Sterne: Position (in % des Symbols) und Startverzögerung. */
const SPARKLES: Record<Rarity, { left: string; top: string; delay: string }[]> = {
  common: [],
  rare: [],
  epic: [
    { left: "65%", top: "5%", delay: "0s" },
    { left: "5%", top: "60%", delay: "1.2s" },
  ],
  legendary: [
    { left: "68%", top: "0%", delay: "0s" },
    { left: "0%", top: "55%", delay: "0.8s" },
    { left: "60%", top: "70%", delay: "1.6s" },
  ],
};

const SPARKLE_COLOR: Record<Rarity, string> = {
  common: "",
  rare: "",
  epic: "#ead6ff",
  legendary: "#fff3c4",
};

/** Pixel-Symbol eines Items – Form nach Typ, Farbe nach Material, Leuchten nach Seltenheit. */
export function ItemIcon({
  def,
  rarity = "common",
  size = 32,
  className = "",
}: {
  def: ItemDef;
  rarity?: Rarity;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    >
      <PixelSprite sprite={getItemSprite(def)} size={size} className={`block ${GLOW[rarity]}`} />
      {SPARKLES[rarity].map((s) => (
        <span
          key={s.delay}
          className="sparkle"
          style={{ left: s.left, top: s.top, animationDelay: s.delay, background: SPARKLE_COLOR[rarity] }}
        />
      ))}
    </span>
  );
}
