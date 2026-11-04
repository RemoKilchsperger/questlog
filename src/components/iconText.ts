// Emojis im Text → Pixel-Icons. Ohne JSX-Syntax geschrieben, weil die eigene
// JSX-Laufzeit (src/jsx) dieses Modul nutzt und sich sonst selbst importieren würde.
import { createElement, Fragment, type ReactNode } from "react";
import { iconSprite } from "../game/iconSprites";
import { spriteUrl } from "./spriteImage";

const EMOJI = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u;
const EMOJI_GLOBAL = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*\s?/gu;

/** Kantenlänge eines Icons mit Umriss in Bildpixeln (Raster 12 + 1 px Rand ringsum). */
export const ICON_PIXELS = 14;

/**
 * Bild eines Pixel-Icons. Ohne `scale` wächst es mit der Schrift (Klasse
 * .game-icon in index.css, immer ein ganzes Vielfaches von 14 px).
 */
export function iconImage(emoji: string, scale?: number, className = "", key?: string | number): ReactNode {
  const sprite = iconSprite(emoji);
  if (!sprite) return emoji;
  const size = scale ? ICON_PIXELS * scale : undefined;
  return createElement("img", {
    key,
    src: spriteUrl(sprite),
    width: size,
    height: size,
    alt: "",
    "aria-hidden": true,
    draggable: false,
    className: `${scale ? "game-icon-fixed" : "game-icon"}${className ? ` ${className}` : ""}`,
  });
}

/** Zerlegt Text in Textstücke und Pixel-Icons – unveränderter Text, wenn keines vorkommt. */
export function withIcons(text: string): ReactNode {
  if (!EMOJI.test(text)) return text;
  const parts = text.split(EMOJI);
  return parts.map((part, i) =>
    i % 2 === 1 ? iconImage(part, undefined, "", i) : part ? createElement(Fragment, { key: i }, part) : null,
  );
}

/** Emojis (samt folgendem Leerzeichen) entfernen – für Tooltips, die keine Bilder zeigen können. */
export function stripIcons(text: string): string {
  return text.replace(EMOJI_GLOBAL, "");
}
