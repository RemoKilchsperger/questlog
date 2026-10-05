import { useMemo } from "react";
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
