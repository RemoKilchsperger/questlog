import { motion } from "motion/react";
import type { QuestItemFind } from "../domain/visitors";

/** Gefundene Quest-Gegenstände für Besucher – mehrere vom selben Gegenstand zusammengefasst. */
export function QuestItemFinds({ finds }: { finds: readonly QuestItemFind[] }) {
  if (finds.length === 0) return null;
  const byItem = new Map<string, QuestItemFind & { found: number }>();
  for (const find of finds) byItem.set(find.item, { ...find, found: (byItem.get(find.item)?.found ?? 0) + 1 });
  return (
    <>
      {[...byItem.values()].map((find) => (
        <motion.p
          key={find.item}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          className="rounded-md border-2 border-gold/60 bg-gold/10 px-3 py-1 font-bold text-gold"
        >
          Quest-Gegenstand: {find.found > 1 && `${find.found}× `}
          {find.icon} {find.item}{" "}
          <span className={`num text-xs font-normal ${find.progress >= find.count ? "text-xp" : "text-muted"}`}>
            ({find.progress}/{find.count}
            {find.progress >= find.count && " ✓"})
          </span>
        </motion.p>
      ))}
    </>
  );
}

