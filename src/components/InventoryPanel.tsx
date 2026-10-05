import { AnimatePresence } from "motion/react";
import { useState, type ReactNode } from "react";
import { getItemStats, ITEM_TYPES, RARITIES } from "../domain/items";
import { getLevel } from "../domain/leveling";
import type { ItemStats, ItemType, OwnedItem, Rarity } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ItemRow } from "./ItemRow";
import { RARITY_TEXT } from "./itemUi";

type TypeFilter = "all" | "armor" | "weapon" | ItemType;

/**
 * Inventarliste mit Filtern nach Typ und Seltenheit. Was man mit einem Item
 * tun kann (anlegen, verkaufen …), bestimmt der jeweilige Tab über `actions`.
 */
export function InventoryPanel({
  title = "Inventar",
  emptyText,
  actions,
  className = "",
}: {
  title?: string;
  emptyText: string;
  actions: (owned: OwnedItem, stats: ItemStats, tooLow: boolean) => ReactNode;
  className?: string;
}) {
  const inventory = useGameStore((s) => s.inventory);
  const equipment = useGameStore((s) => s.equipment);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");

  const entries = inventory.map((owned) => ({ owned, stats: getItemStats(owned) }));
  const visible = entries.filter(
    ({ stats }) =>
      (typeFilter === "all" || typeFilter === stats.def.kind || typeFilter === stats.def.type) &&
      (rarityFilter === "all" || rarityFilter === stats.rarity),
  );

  return (
    <section className={`panel self-start p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">{title}</h2>
        <span className="text-xs text-muted">
          {visible.length === inventory.length
            ? `${inventory.length} Items`
            : `${visible.length} von ${inventory.length} Items`}
        </span>
      </div>

      {inventory.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Nach Typ filtern"
            className="rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 text-sm outline-none focus:border-gold"
          >
            <option value="all">Alle Typen</option>
            <option value="armor">Alle Rüstungsteile</option>
            <option value="weapon">Alle Waffen</option>
            <optgroup label="Rüstung">
              {ITEM_TYPES.filter((t) => t.kind === "armor").map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Waffen">
              {ITEM_TYPES.filter((t) => t.kind === "weapon").map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Nach Seltenheit filtern">
            <FilterChip active={rarityFilter === "all"} onClick={() => setRarityFilter("all")}>
              Alle
            </FilterChip>
            {RARITIES.map((r) => (
              <FilterChip
                key={r.key}
                active={rarityFilter === r.key}
                onClick={() => setRarityFilter(r.key)}
                className={RARITY_TEXT[r.key]}
              >
                {r.label}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {inventory.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">Keine Items passen zu diesem Filter.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visible.map(({ owned, stats }) => {
              const tooLow = level < stats.def.requiredLevel;
              return (
                <ItemRow key={owned.uid} stats={stats} equipment={equipment} tooLow={tooLow}>
                  {actions(owned, stats, tooLow)}
                </ItemRow>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border-2 px-2 py-0.5 text-xs ${
        active ? "border-gold bg-night-800" : "border-night-700 opacity-70 hover:opacity-100"
      } ${className || (active ? "text-gold" : "text-muted")}`}
    >
      {children}
    </button>
  );
}
