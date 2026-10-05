import { motion } from "motion/react";
import { getLevelProgress } from "../domain/leveling";

export function XpBar({ totalXp, size = "md" }: { totalXp: number; size?: "sm" | "md" }) {
  const { xpInLevel, xpNeeded, ratio } = getLevelProgress(totalXp);
  const height = size === "sm" ? "h-2.5" : "h-4";

  return (
    <div className="w-full">
      <div
        className={`${height} w-full overflow-hidden rounded-sm border-2 border-night-950 bg-night-700`}
        role="progressbar"
        aria-label="Erfahrung"
        aria-valuenow={xpInLevel}
        aria-valuemax={xpNeeded}
      >
        <motion.div
          className="h-full bg-xp"
          initial={false}
          animate={{ width: `${Math.max(ratio * 100, 2)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      {size === "md" && (
        <p className="mt-1 text-right text-xs text-muted tabular-nums">
          {xpNeeded === 0 ? "Maximallevel erreicht" : `${xpInLevel} / ${xpNeeded} XP`}
        </p>
      )}
    </div>
  );
}
