import { creatureImage } from "../game/creatureImages";
import { getCreatureSprite } from "../game/creatureSprites";
import { PixelSprite } from "./PixelSprite";

/** Bild eines Gegners – das PNG, falls es eines gibt, sonst die Pixel-Grafik. */
export function CreatureSprite({ sprite, size, className = "" }: { sprite: string; size: number; className?: string }) {
  const url = creatureImage(sprite);
  if (url) {
    return (
      <img
        src={url}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
        className={`pixelated object-contain ${className}`}
      />
    );
  }
  return <PixelSprite sprite={getCreatureSprite(sprite)} size={size} className={className} />;
}
