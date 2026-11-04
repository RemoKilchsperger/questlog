// Gemeinsamer Kern der eigenen JSX-Laufzeit (jsx-runtime.ts, jsx-dev-runtime.ts):
// Text in HTML-Elementen bekommt Pixel-Icons statt Emojis, Tooltips verlieren
// ihre Emojis. Komponenten selbst bekommen ihre Props unverändert – nur was
// wirklich im DOM landet, wird umgewandelt.
import { isMotionComponent } from "motion/react";
import type { ReactNode } from "react";
import { stripIcons, withIcons } from "../components/iconText";

/** In diesen Elementen darf nur reiner Text stehen. */
const TEXT_ONLY = new Set(["textarea", "title", "style", "script", "text", "tspan"]);

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

function convert(children: unknown): unknown {
  if (typeof children === "string") return HAS_EMOJI.test(children) ? withIcons(children) : children;
  if (Array.isArray(children)) {
    let changed = false;
    const next = children.map((child) => {
      const converted = typeof child === "string" ? convert(child) : child;
      if (converted !== child) changed = true;
      return converted;
    });
    return changed ? next : children;
  }
  return children;
}

/** Auswahllisten können keine Bilder zeigen – dort fallen die Emojis weg. */
function strip(children: unknown): unknown {
  if (typeof children === "string") return HAS_EMOJI.test(children) ? stripIcons(children) : children;
  if (Array.isArray(children)) return children.map(strip);
  return children;
}

export function transformProps(type: unknown, props: Record<string, unknown>): Record<string, unknown> {
  if (props == null) return props;
  // motion.button & Co. reichen ihre Kinder ohne unsere Laufzeit an das DOM weiter
  if (typeof type !== "string" && !isMotionComponent(type as never)) return props;
  if (type === "option") return { ...props, children: strip(props.children) as ReactNode };
  if (typeof type === "string" && TEXT_ONLY.has(type)) return props;
  let next = props;
  const children = convert(props.children);
  if (children !== props.children) next = { ...next, children: children as ReactNode };
  if (typeof props.title === "string" && HAS_EMOJI.test(props.title)) next = { ...next, title: stripIcons(props.title) };
  return next;
}
