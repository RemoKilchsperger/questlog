import { useId, useMemo } from "react";
import { renderSprite, type SpriteDef } from "../game/sprites";

/** Zeichnet eine Pixel-Grafik als SVG (scharf in jeder Grösse). */
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
  const image = useMemo(() => renderSprite(sprite, outline), [sprite, outline]);
  return (
    <svg
      viewBox={`0 0 ${image.width} ${image.height}`}
      width={size}
      height={size}
      className={`pixelated ${className}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {image.pixels.flatMap((row, y) =>
        row.map((color, x) =>
          color ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null,
        ),
      )}
    </svg>
  );
}

/**
 * Leuchtschicht über einer Pixel-Grafik (gleiches Raster, gleicher Rand wie
 * `PixelSprite` mit Umriss): ein weicher, pulsierender Schein hinter der
 * Grafik und ein leichter Schimmer darüber.
 */
export function GlowSprite({ sprite, size = 96 }: { sprite: SpriteDef; size?: number }) {
  const image = useMemo(() => renderSprite(sprite, false, 1), [sprite]);
  const filterId = `glow-${useId().replace(/:/g, "")}`;
  const pixels = image.pixels.flatMap((row, y) =>
    row.map((color, x) => (color ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null)),
  );
  const box = `0 0 ${image.width} ${image.height}`;
  return (
    <>
      <svg viewBox={box} width={size} height={size} className="boss-halo pointer-events-none absolute inset-0" aria-hidden>
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feMorphology operator="dilate" radius="0.6" />
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>{pixels}</g>
      </svg>
      <svg
        viewBox={box}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="boss-shimmer pixelated pointer-events-none absolute inset-0"
        aria-hidden
      >
        {pixels}
      </svg>
    </>
  );
}
