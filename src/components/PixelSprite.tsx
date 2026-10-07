import { useMemo } from "react";
import type { SpriteDef } from "../game/sprites";
import { haloUrl, spriteUrl } from "./spriteImage";

/** Zeichnet eine Pixel-Grafik als Bild (scharf in jeder Grösse, siehe spriteImage.ts). */
export function PixelSprite({
  sprite,
  size = 96,
  outline = true,
  className = "",
}: {
  sprite: SpriteDef;
  size?: number;
  outline?: boolean;
  className?: string;
}) {
  const url = useMemo(() => spriteUrl(sprite, outline), [sprite, outline]);
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

/**
 * Leuchtschicht über einer Pixel-Grafik (gleiches Raster, gleicher Rand wie
 * `PixelSprite` mit Umriss): ein weicher, pulsierender Schein hinter der
 * Grafik und ein leichter Schimmer darüber. Beide sind fertige Bilder, animiert
 * wird nur die Deckkraft – das kann der Browser ohne Neuzeichnen.
 */
export function GlowSprite({ sprite, size = 96 }: { sprite: SpriteDef; size?: number }) {
  const halo = useMemo(() => haloUrl(sprite), [sprite]);
  const shimmer = useMemo(() => spriteUrl(sprite, false, 1), [sprite]);
  const style = "pointer-events-none absolute inset-0 object-contain";
  return (
    <>
      <img src={halo} width={size} height={size} alt="" aria-hidden draggable={false} className={`boss-halo ${style}`} />
      <img
        src={shimmer}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
        className={`boss-shimmer pixelated ${style}`}
      />
    </>
  );
}
