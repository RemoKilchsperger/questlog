import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const CARD_WIDTH = 232;
const GAP = 8;

/**
 * Zeigt beim Überfahren (oder Fokussieren) eine Karte neben dem Element – für Items
 * (ItemTooltip) und Fähigkeiten. Die Karte liegt per Portal über allem, damit
 * scrollende Listen sie nicht abschneiden.
 */
export function HoverCard({
  card,
  border = "border-night-700",
  width = CARD_WIDTH,
  compact = false,
  className = "inline-flex shrink-0",
  children,
}: {
  /** Inhalt der Karte – wird erst beim Überfahren gezeichnet */
  card: ReactNode;
  /** Rahmenfarbe der Karte (Tailwind-Klasse) */
  border?: string;
  width?: number;
  /** Kleine Karte für kurze Erklärungen (linksbündig, weniger Rand) */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = () => anchor.current && setRect(anchor.current.getBoundingClientRect());
  const hide = () => setRect(null);

  // Beim Scrollen verschiebt sich das Element – Karte dann einfach schliessen.
  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [rect]);

  return (
    <span ref={anchor} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {rect &&
        createPortal(
          <FloatingCard anchor={rect} border={border} width={width} compact={compact}>
            {card}
          </FloatingCard>,
          document.body,
        )}
    </span>
  );
}

/**
 * Kleine Hover-Karte mit einer kurzen Erklärung – statt des einfachen Browser-Hinweises (`title`).
 * Zeilenumbrüche (`\n`) im Text bleiben erhalten.
 */
export function Hint({
  text,
  heading,
  className,
  children,
}: {
  text: ReactNode;
  heading?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <HoverCard
      compact
      width={HINT_WIDTH}
      className={className}
      card={
        <>
          {heading && <p className="font-pixel text-gold">{heading}</p>}
          <p className="whitespace-pre-line text-sm">{text}</p>
        </>
      }
    >
      {children}
    </HoverCard>
  );
}

const HINT_WIDTH = 220;

function FloatingCard({
  anchor,
  border,
  width,
  compact,
  children,
}: {
  anchor: DOMRect;
  border: string;
  width: number;
  compact: boolean;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);

  // Rechts neben dem Element, bei Platzmangel links davon; vertikal im Fenster halten.
  const fitsRight = anchor.right + GAP + width <= window.innerWidth - GAP;
  const left = fitsRight ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - width);
  useLayoutEffect(() => {
    const height = card.current?.offsetHeight ?? 0;
    const centered = anchor.top + anchor.height / 2 - height / 2;
    setTop(Math.min(Math.max(GAP, centered), window.innerHeight - height - GAP));
  }, [anchor]);

  return (
    <motion.div
      ref={card}
      role="tooltip"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      style={{ left, top, width }}
      className={`panel pointer-events-none fixed z-[60] flex flex-col gap-1 border-2 ${
        compact ? "px-3 py-2 text-left" : "items-center p-3 text-center"
      } ${border}`}
    >
      {children}
    </motion.div>
  );
}
