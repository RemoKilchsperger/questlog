import { motion } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
import {
  canSalvage,
  canUpgrade,
  ESSENCE_PER_RARITY,
  essenceFor,
  essenceYield,
  investedEssence,
  upgradeCost,
} from "../domain/forge";
import { getItemStats, MAX_UPGRADE, RARITIES, UPGRADE_STEP } from "../domain/items";
import { getLevel } from "../domain/leveling";
import type { ItemStats, OwnedItem } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Essence } from "./Gold";
import { InventoryPanel } from "./InventoryPanel";
import { ItemIcon } from "./ItemIcon";
import { ItemRow } from "./ItemRow";
import { itemName, mainStatText, RARITY_TEXT, rarityLabel } from "./itemUi";

type View = "upgrade" | "salvage";

export function SmithScreen() {
  const essence = useGameStore((s) => s.character.essence);
  const [view, setView] = useState<View>("upgrade");
  const [pendingUpgrade, setPendingUpgrade] = useState<OwnedItem | null>(null);
  const [pendingSalvage, setPendingSalvage] = useState<OwnedItem | null>(null);
  const closeUpgrade = useCallback(() => setPendingUpgrade(null), []);
  const closeSalvage = useCallback(() => setPendingSalvage(null), []);

  const upgradeButton = (owned: OwnedItem) => (
    <UpgradeButton owned={owned} essence={essence} onClick={() => setPendingUpgrade(owned)} />
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-pixel text-2xl">Schmied</h2>
          <Essence amount={essence} className="text-lg font-bold text-essence" />
        </div>
        <div className="mb-3 flex gap-1">
          <ViewChip active={view === "upgrade"} onClick={() => setView("upgrade")}>
            ⚒️ Verbessern
          </ViewChip>
          <ViewChip active={view === "salvage"} onClick={() => setView("salvage")}>
            💠 Zerlegen
          </ViewChip>
        </div>
        {view === "upgrade" ? <UpgradeInfo onUpgrade={upgradeButton} /> : <SalvageInfo />}
      </section>

      {view === "upgrade" ? (
        <InventoryPanel
          title="Inventar verbessern"
          emptyText="Dein Inventar ist leer. Angelegte Items kannst du links verbessern."
          actions={upgradeButton}
        />
      ) : (
        <InventoryPanel
          title="Zerlegen"
          emptyText="Dein Inventar ist leer. Erledige Quests und Kämpfe für Beute."
          actions={(owned) =>
            canSalvage(owned) ? (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setPendingSalvage(owned)}
                className="rounded-md border-2 border-essence/60 px-2 py-0.5 text-sm text-essence hover:bg-essence/15"
              >
                Zerlegen <Essence amount={essenceYield(owned)} sign />
              </motion.button>
            ) : (
              <span className="text-xs text-muted" title="Erst ab der Seltenheit „selten“">
                nicht zerlegbar
              </span>
            )
          }
        />
      )}

      <UpgradeDialog owned={pendingUpgrade} essence={essence} onClose={closeUpgrade} />
      <SalvageDialog owned={pendingSalvage} onClose={closeSalvage} />
    </div>
  );
}

/** Erklärung und die angelegte Ausrüstung – die lässt sich direkt verbessern. */
function UpgradeInfo({ onUpgrade }: { onUpgrade: (owned: OwnedItem) => ReactNode }) {
  const equipment = useGameStore((s) => s.equipment);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const equipped = Object.values(equipment).filter((i): i is OwnedItem => i !== null);

  return (
    <>
      <p className="text-sm text-muted">
        Mit Essenz schmiedet der Schmied deine Ausrüstung nach: Waffen bekommen mehr{" "}
        <span className="text-strength">Angriff</span>, Rüstungen und Schilde mehr{" "}
        <span className="text-intellect">Rüstung</span> – je Stufe +{Math.round(UPGRADE_STEP * 100)} %, bis{" "}
        <span className="text-parchment">+{MAX_UPGRADE}</span>. Jede Stufe kostet mehr als die vorige, also überleg
        dir gut, welches Stück es wert ist.
      </p>
      <h3 className="font-pixel mb-2 mt-4 text-lg">Angelegt</h3>
      {equipped.length === 0 ? (
        <p className="text-sm text-muted">Du hast nichts angelegt.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {equipped.map((owned) => {
            const stats = getItemStats(owned);
            return (
              <ItemRow key={owned.uid} owned={owned} stats={stats} equipment={equipment} tooLow={level < stats.def.requiredLevel}>
                {onUpgrade(owned)}
              </ItemRow>
            );
          })}
        </ul>
      )}
    </>
  );
}

function SalvageInfo() {
  return (
    <>
      <p className="text-sm text-muted">
        Der Schmied zerlegt Ausrüstung ab der Seltenheit <span className="text-rare">selten</span> in Essenz.
        Seltenere und höherstufige Items geben mehr, verbesserte Items geben zusätzlich die Hälfte der investierten
        Essenz zurück. Angelegte Items musst du zuerst ablegen.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-1 font-normal">Seltenheit</th>
            <th className="pb-1 text-right font-normal">Item Lv. 1</th>
            <th className="pb-1 text-right font-normal">Item Lv. 30</th>
            <th className="pb-1 text-right font-normal">Item Lv. 60</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.filter((r) => ESSENCE_PER_RARITY[r.key] > 0).map((r) => (
            <tr key={r.key} className="border-t border-night-700">
              <td className={`py-1 ${RARITY_TEXT[r.key]}`}>{r.label}</td>
              {[1, 30, 60].map((level) => (
                <td key={level} className="py-1 text-right">
                  <Essence amount={essenceFor(r.key, level)} className="text-essence" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function UpgradeButton({ owned, essence, onClick }: { owned: OwnedItem; essence: number; onClick: () => void }) {
  if (!canUpgrade(owned)) return <span className="text-xs text-essence">max. +{MAX_UPGRADE}</span>;
  const cost = upgradeCost(owned);
  const tooPoor = essence < cost;
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      disabled={tooPoor}
      onClick={onClick}
      title={tooPoor ? "Nicht genug Essenz" : `Auf +${(owned.upgrade ?? 0) + 1} verbessern`}
      className="rounded-md border-2 border-essence/60 px-2 py-0.5 text-sm text-essence hover:bg-essence/15 disabled:cursor-not-allowed disabled:opacity-40"
    >
      +{(owned.upgrade ?? 0) + 1} <Essence amount={cost} className="font-bold" />
    </motion.button>
  );
}

function UpgradeDialog({ owned, essence, onClose }: { owned: OwnedItem | null; essence: number; onClose: () => void }) {
  const upgrade = useGameStore((s) => s.upgrade);
  const before = owned ? getItemStats(owned) : null;
  const after = owned ? getItemStats({ ...owned, upgrade: (owned.upgrade ?? 0) + 1 }) : null;
  const cost = owned ? upgradeCost(owned) : 0;

  return (
    <ConfirmDialog
      open={owned !== null}
      title="Item verbessern?"
      confirmLabel="Verbessern"
      onCancel={onClose}
      onConfirm={() => {
        if (owned) upgrade(owned.uid);
        onClose();
      }}
    >
      {before && after && (
        <>
          <ItemLine stats={before} />
          <p className="mt-2">
            {itemName(before)} → <span className="font-semibold text-essence">{itemName(after)}</span>
          </p>
          <p className="num mt-1">
            {mainStatText(before)} → <span className="font-bold text-xp">{mainStatText(after)}</span>
          </p>
          <p className="mt-2">
            Kosten: <Essence amount={cost} className="font-bold text-essence" /> · danach übrig:{" "}
            <Essence amount={essence - cost} />
          </p>
        </>
      )}
    </ConfirmDialog>
  );
}

function SalvageDialog({ owned, onClose }: { owned: OwnedItem | null; onClose: () => void }) {
  const salvage = useGameStore((s) => s.salvage);
  const stats = owned ? getItemStats(owned) : null;

  return (
    <ConfirmDialog
      open={owned !== null}
      title="Item zerlegen?"
      confirmLabel="Zerlegen"
      onCancel={onClose}
      onConfirm={() => {
        if (owned) salvage(owned.uid);
        onClose();
      }}
    >
      {stats && owned && (
        <>
          <ItemLine stats={stats} />
          <p className="mt-2">
            Du erhältst <Essence amount={essenceYield(owned)} className="font-bold text-essence" />
            {stats.upgrade > 0 && (
              <span className="text-muted">
                {" "}
                (inkl. Hälfte der investierten <Essence amount={investedEssence(owned)} />)
              </span>
            )}
            . Das Item ist danach weg.
          </p>
        </>
      )}
    </ConfirmDialog>
  );
}

function ItemLine({ stats }: { stats: ItemStats }) {
  return (
    <p>
      <span className={`font-semibold ${RARITY_TEXT[stats.rarity]}`}>
        <ItemIcon def={stats.def} rarity={stats.rarity} size={24} /> {itemName(stats)}
      </span>{" "}
      <span className="text-muted">({rarityLabel(stats.rarity)})</span>
    </p>
  );
}

function ViewChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border-2 px-3 py-1 text-sm ${
        active ? "border-essence text-essence" : "border-night-700 text-muted hover:text-parchment"
      }`}
    >
      {children}
    </button>
  );
}
