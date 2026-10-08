import type { ReactNode } from "react";
import { getActiveSets } from "../domain/bossSets";
import { bossName, isCoopBoss } from "../domain/bosses";
import { STAT_LABELS } from "../domain/stats";
import type { ItemStats, WeaponType } from "../domain/types";
import { weaponStat } from "../domain/weaponScaling";
import { useGameStore } from "../store/gameStore";
import { BossSetInfo } from "./BossSetInfo";
import { HoverCard } from "./HoverCard";
import { ItemIcon } from "./ItemIcon";
import { armorClassPerkText, bonusText, itemName, MAIN_STAT_TEXT, mainStatParts, RARITY_BORDER, RARITY_TEXT, rarityLabel, typeText } from "./itemUi";

/** Zeigt beim Überfahren (oder Fokussieren) ein grosses Symbol mit allen Werten des Items. */
export function ItemTooltip({
  stats,
  hint,
  className,
  children,
}: {
  stats: ItemStats;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <HoverCard card={<ItemCard stats={stats} hint={hint} />} border={RARITY_BORDER[stats.rarity]} className={className}>
      {children}
    </HoverCard>
  );
}

function ItemCard({ stats, hint }: { stats: ItemStats; hint?: string }) {
  const { def, rarity } = stats;
  const bonuses = bonusText(stats.bonuses);
  const equipment = useGameStore((s) => s.equipment);
  const setPieces = getActiveSets(equipment).find((a) => a.set.bossId === def.bossId)?.pieces ?? 0;

  return (
    <>
      <div className="rounded-md bg-night-950/60 p-2">
        <ItemIcon def={def} rarity={rarity} size={96} />
      </div>
      <p className={`font-pixel text-lg leading-tight ${RARITY_TEXT[rarity]}`}>{itemName(stats)}</p>
      <p className="text-xs text-muted">
        {rarity !== "common" && <span className={RARITY_TEXT[rarity]}>{rarityLabel(rarity)} · </span>}
        {typeText(def)}
      </p>
      <p className="num text-base">
        {mainStatParts(stats).map((part, i) => (
          <span key={part.kind} className={MAIN_STAT_TEXT[part.kind]}>
            {i > 0 && <span className="text-muted"> · </span>}
            {part.text}
          </span>
        ))}
      </p>
      {def.kind === "weapon" && (
        <p className="text-xs text-muted">skaliert mit {STAT_LABELS[weaponStat(def.type as WeaponType)]}</p>
      )}
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
    </>
  );
}
