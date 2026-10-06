import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getActiveSets } from "../domain/bossSets";
import { bossName, isCoopBoss } from "../domain/bosses";
import type { ItemStats } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { BossSetInfo } from "./BossSetInfo";
import { ItemIcon } from "./ItemIcon";
import { armorClassPerkText, bonusText, itemName, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel, typeText } from "./itemUi";

const CARD_WIDTH = 232;
const GAP = 8;

/**
 * Zeigt beim Überfahren (oder Fokussieren) ein grosses Symbol mit allen Werten.
 * Die Karte liegt per Portal über allem, damit scrollende Listen sie nicht abschneiden.
 */
export function ItemTooltip({
  stats,
  hint,
  className = "inline-flex shrink-0",
  children,
}: {
  stats: ItemStats;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = () => anchor.current && setRect(anchor.current.getBoundingClientRect());
  const hide = () => setRect(null);

  // Beim Scrollen verschiebt sich das Item – Karte dann einfach schliessen.
  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [rect]);

  return (
    <span
      ref={anchor}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {rect && createPortal(<TooltipCard stats={stats} hint={hint} anchor={rect} />, document.body)}
    </span>
  );
}

function TooltipCard({ stats, hint, anchor }: { stats: ItemStats; hint?: string; anchor: DOMRect }) {
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);
  const { def, rarity } = stats;
  const bonuses = bonusText(stats.bonuses);
  const equipment = useGameStore((s) => s.equipment);
  const setPieces = getActiveSets(equipment).find((a) => a.set.bossId === def.bossId)?.pieces ?? 0;

  // Rechts neben dem Item, bei Platzmangel links davon; vertikal im Fenster halten.
  const fitsRight = anchor.right + GAP + CARD_WIDTH <= window.innerWidth - GAP;
  const left = fitsRight ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - CARD_WIDTH);
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
      style={{ left, top, width: CARD_WIDTH }}
      className={`panel pointer-events-none fixed z-[60] flex flex-col items-center gap-1 border-2 p-3 text-center ${RARITY_BORDER[rarity]}`}
    >
      <div className="rounded-md bg-night-950/60 p-2">
        <ItemIcon def={def} rarity={rarity} size={96} />
      </div>
      <p className={`font-pixel text-lg leading-tight ${RARITY_TEXT[rarity]}`}>{itemName(stats)}</p>
      <p className="text-xs text-muted">
        {rarity !== "common" && <span className={RARITY_TEXT[rarity]}>{rarityLabel(rarity)} · </span>}
        {typeText(def)}
      </p>
      <p className={`num text-base ${stats.attack > 0 ? "text-strength" : "text-intellect"}`}>{mainStatText(stats)}</p>
      {bonuses && <p className="text-sm text-xp">{bonuses}</p>}
      {armorClassPerkText(def) && <p className="text-xs text-intellect">{armorClassPerkText(def)} (Rüstungsklasse)</p>}
      {def.bossId && (
        <>
          <p className="text-xs text-legendary">👑 Einzigartig – {isCoopBoss(def.bossId) ? "Raid-Beute" : "Beute"} von {bossName(def.bossId)}</p>
          <div className="mt-1 w-full rounded-md bg-night-950/60 p-1.5 text-left">
            <BossSetInfo bossId={def.bossId} pieces={setPieces} />
          </div>
        </>
      )}
      <p className="text-xs text-muted">benötigt Level {def.requiredLevel}</p>
      {hint && <p className="mt-1 text-xs text-gold">{hint}</p>}
    </motion.div>
  );
}
