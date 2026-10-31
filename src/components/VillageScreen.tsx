import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { AREAS } from "../domain/creatures";
import {
  BUILDINGS,
  canBuild,
  MATERIALS,
  MAX_BUILDING_TIER,
  missingForBuild,
  nextBuildCost,
  type BuildCost,
  type BuildingDef,
  type MaterialId,
  type MaterialStock,
} from "../domain/village";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatNumber, Gold } from "./Gold";
import { Hint } from "./HoverCard";

/** Dorf-Ausbau: Materialvorrat und die vier Gebäude mit ihrer nächsten Stufe. */
export function VillageScreen() {
  const [pending, setPending] = useState<BuildingDef | null>(null);
  const close = useCallback(() => setPending(null), []);
  const build = useGameStore((s) => s.build);
  const village = useGameStore((s) => s.village);

  return (
    <div className="flex flex-col gap-4">
      <MaterialPanel />
      <div className="grid gap-4 sm:grid-cols-2">
        {BUILDINGS.map((def) => (
          <BuildingCard key={def.id} def={def} onBuild={() => setPending(def)} />
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `${pending.name} ausbauen?` : ""}
        confirmLabel="Bauen"
        onCancel={close}
        onConfirm={() => {
          if (pending) build(pending.id);
          setPending(null);
        }}
      >
        {pending && (
          <>
            <p>
              {pending.tiers[village[pending.id]].icon} {pending.tiers[village[pending.id]].name} →{" "}
              <span className="font-semibold text-gold">
                {pending.tiers[village[pending.id] + 1]?.icon} {pending.tiers[village[pending.id] + 1]?.name}
              </span>
            </p>
            <p className="mt-1 text-sm text-parchment">{pending.tiers[village[pending.id] + 1]?.effect}</p>
            <div className="mt-2 text-sm">
              Kosten: <CostList cost={nextBuildCost(village, pending.id)!} />
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Vorrat aller Materialien – mit dem Gebiet, in dem sie fallen. */
function MaterialPanel() {
  const materials = useGameStore((s) => s.materials);
  const gold = useGameStore((s) => s.character.gold);

  return (
    <section className="panel p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">🏘️ Dorf</h2>
        <Gold amount={gold} className="text-lg font-bold text-gold" />
      </div>
      <p className="mb-3 text-xs text-muted">
        Baue dein Dorf aus: Jedes Gebäude hat drei Stufen und wird sofort fertig. Bauen kostet Gold und Material – jedes
        Gebiet hat eines, und jeder Sieg dort bringt sicher welches (Elite-Gegner 3, Bosse 5, Dungeons doppelt).
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MATERIALS.map((m) => {
          const area = AREAS.find((a) => a.id === m.areaId);
          const count = materials[m.id] ?? 0;
          return (
            <li key={m.id}>
              <Hint text={`Fällt im Gebiet ${area?.name ?? m.areaId} (Lv. ${area?.minLevel}–${area?.maxLevel}) und bei Gegnern dieses Levels.`}>
                <span
                  className={`flex items-center gap-2 rounded-md border-2 border-night-700 bg-night-800 px-2 py-1 text-sm ${
                    count === 0 ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {m.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="num font-bold text-material">{formatNumber(count)}</span>
                </span>
              </Hint>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BuildingCard({ def, onBuild }: { def: BuildingDef; onBuild: () => void }) {
  const tier = useGameStore((s) => s.village[def.id]);
  const gold = useGameStore((s) => s.character.gold);
  const materials = useGameStore((s) => s.materials);
  const village = useGameStore((s) => s.village);
  const current = def.tiers[tier];
  const next = tier < MAX_BUILDING_TIER ? def.tiers[tier + 1] : null;
  const cost = nextBuildCost(village, def.id);
  const affordable = canBuild(village, def.id, gold, materials);

  return (
    <section className={`panel flex flex-col gap-3 p-4 ${tier === MAX_BUILDING_TIER ? "border-gold/60" : ""}`}>
      <div className="flex items-start gap-3">
        <motion.span
          key={tier}
          initial={{ scale: 0.5, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 border-night-700 bg-night-800 text-3xl ${
            tier === 0 && def.id !== "merchant" ? "grayscale opacity-60" : ""
          }`}
          aria-hidden
        >
          {current.icon}
        </motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="font-pixel text-xl">
            {def.icon} {def.name}
          </h3>
          <p className="text-sm text-gold">{tier === 0 && def.id !== "merchant" ? "Nicht gebaut" : current.name}</p>
          <TierPips tier={tier} />
        </div>
      </div>
      <p className="text-xs text-muted">{def.description}</p>
      <p className="text-sm">
        <span className="text-muted">Jetzt: </span>
        {current.effect}
      </p>
      {next && cost ? (
        <div className="mt-auto rounded-md border-2 border-night-700 bg-night-900 p-3">
          <p className="text-sm">
            <span className="text-muted">Stufe {tier + 1}: </span>
            <span className="font-semibold">
              {next.icon} {next.name}
            </span>
          </p>
          <p className="text-xs text-parchment">{next.effect}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <CostList cost={cost} gold={gold} materials={materials} />
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={!affordable}
              onClick={onBuild}
              title={affordable ? undefined : "Es fehlt noch Gold oder Material"}
              className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tier === 0 && def.id !== "merchant" ? "Bauen" : "Ausbauen"}
            </motion.button>
          </div>
        </div>
      ) : (
        <p className="mt-auto text-sm text-xp">✓ Ganz ausgebaut</p>
      )}
    </section>
  );
}

function TierPips({ tier }: { tier: number }) {
  return (
    <span className="mt-1 flex gap-1" aria-label={`Stufe ${tier} von ${MAX_BUILDING_TIER}`}>
      {Array.from({ length: MAX_BUILDING_TIER }, (_, i) => (
        <span key={i} className={`h-2 w-6 rounded-sm ${i < tier ? "bg-gold" : "bg-night-700"}`} />
      ))}
    </span>
  );
}

/** Kosten einer Stufe – was fehlt, steht in Rot mit dem aktuellen Vorrat („30 💀 – du hast 12“). */
function CostList({ cost, gold, materials }: { cost: BuildCost; gold?: number; materials?: MaterialStock }) {
  const missing = gold !== undefined && materials ? missingForBuild(cost, gold, materials) : null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Gold amount={cost.gold} className={missing && missing.gold > 0 ? "text-danger" : "text-gold"} />
      {(Object.entries(cost.materials) as [MaterialId, number][]).map(([id, need]) => {
        const def = MATERIALS.find((m) => m.id === id)!;
        const short = missing?.materials[id];
        return (
          <Hint key={id} text={def.name}>
            <span className={short ? "text-danger" : "text-material"}>
              <span className="num">{need}</span> {def.icon}
              {short !== undefined && materials && (
                <span className="text-xs"> – du hast {materials[id] ?? 0}</span>
              )}
            </span>
          </Hint>
        );
      })}
    </span>
  );
}
