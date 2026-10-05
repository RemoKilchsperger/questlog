import { getActiveSets, getBossSet, setStatBonus, type SetTier } from "../domain/bossSets";
import { getBossItems } from "../domain/items";
import { STAT_LABELS } from "../domain/rewards";
import type { Equipment } from "../domain/types";

/** Name, Fortschritt und alle Bonusstufen eines Boss-Sets – erfüllte Stufen hervorgehoben. */
export function BossSetInfo({ bossId, pieces }: { bossId: string; pieces: number }) {
  const set = getBossSet(bossId);
  const total = getBossItems(bossId).length;
  const describe = (tier: SetTier) =>
    tier.kind === "stat"
      ? `+${setStatBonus(bossId)} ${STAT_LABELS[set.stat]}`
      : tier.kind === "gear"
        ? `+${Math.round(tier.percent * 100)} % Angriff & Rüstung`
        : `+${Math.round(tier.percent * 100)} % Lebenspunkte`;
  const tiers: [number, string][] = set.tiers.map((t) => [t.pieces, describe(t)]);
  return (
    <div className="text-xs">
      <p className="text-legendary">
        👑 {set.name}{" "}
        <span className="num">
          ({pieces}/{total})
        </span>
      </p>
      {tiers.map(([needed, text]) => (
        <p key={needed} className={pieces >= needed ? "text-xp" : "text-muted"}>
          {pieces >= needed ? "✓" : "·"} {needed} Teile: {text}
        </p>
      ))}
    </div>
  );
}

/** Alle Sets, von denen gerade etwas angelegt ist. */
export function ActiveSets({ equipment }: { equipment: Equipment }) {
  const sets = getActiveSets(equipment);
  if (sets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-legendary/40 bg-night-800 p-2">
      {sets.map((a) => (
        <BossSetInfo key={a.set.bossId} bossId={a.set.bossId} pieces={a.pieces} />
      ))}
    </div>
  );
}
