import { ARMOR_CLASSES } from "../domain/armorClasses";
import { getHeroCombatProfile } from "../domain/combat";
import { getArmorClassSummary, getCombatStats, getStatBonuses, isOffHandBlocked, slotsFor } from "../domain/equipment";
import { getItemStats, SLOT_ICONS, SLOT_LABELS } from "../domain/items";
import type { EquipSlot, Equipment } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ActiveSets } from "./BossSetInfo";
import { InventoryPanel } from "./InventoryPanel";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { bonusText, itemName, mainStatParts, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";
import { HeroClassPanel } from "./HeroClassInfo";
import { gearScore } from "../domain/gearScore";

/** Position der Slots im „Paper-Doll“-Raster (Spalte / Zeile). */
const SLOT_LAYOUT: { slot: EquipSlot; className: string }[] = [
  { slot: "head", className: "col-start-2 row-start-1" },
  { slot: "arms", className: "col-start-1 row-start-2" },
  { slot: "chest", className: "col-start-2 row-start-2" },
  { slot: "weapon1", className: "col-start-1 row-start-3" },
  { slot: "legs", className: "col-start-2 row-start-3" },
  { slot: "weapon2", className: "col-start-3 row-start-3" },
  { slot: "feet", className: "col-start-2 row-start-4" },
];

export function EquipmentScreen() {
  const equipment = useGameStore((s) => s.equipment);
  const character = useGameStore((s) => s.character);
  const { armor, attack } = getCombatStats(equipment);
  // Schaden pro Treffer mit allem – was nicht aus dem Angriff der Items kommt, steht in Klammern
  const damage = Math.round(getHeroCombatProfile(character, equipment).damage);
  const bonuses = bonusText(
    Object.fromEntries(Object.entries(getStatBonuses(equipment)).filter(([, v]) => v > 0)),
  );

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <section className="panel flex flex-col gap-4 self-start p-5">
        <h2 className="font-pixel text-2xl">Ausrüstung</h2>
        <div className="grid grid-cols-3 gap-2">
          {SLOT_LAYOUT.map(({ slot, className }) => (
            <SlotTile key={slot} slot={slot} className={className} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CombatTile label="Rüstung" value={armor} accent="text-intellect" />
          <CombatTile
            label="Schaden"
            value={attack}
            extra={damage - attack}
            title={`${attack} aus dem Angriff der Items, ${damage - attack >= 0 ? "+" : "−"}${Math.abs(damage - attack)} aus Grundschaden, Attribut-Skalierung, Klasse, Skills und Set-Bonus – zusammen ${damage} Schaden pro Treffer`}
            accent="text-strength"
          />
        </div>
        <div
          className="rounded-md bg-night-800 p-2 text-center"
          title="Durchschnitt aller 7 Plätze aus Item-Level × Seltenheit, +2 % pro Schmied-Stufe. Zweihandwaffen zählen doppelt."
        >
          <div className="num text-2xl text-legendary">{gearScore(equipment)}</div>
          <div className="text-xs text-muted">Gear Score</div>
        </div>
        <div className="rounded-md bg-night-800 p-2 text-center text-sm">
          <div className="text-xs text-muted">Attributboni</div>
          <div className="text-xp">{bonuses || "–"}</div>
        </div>
        <ArmorClassInfo equipment={equipment} />
        <HeroClassPanel equipment={equipment} />
        <ActiveSets equipment={equipment} />
        <p className="text-xs text-muted">Klicke auf ein angelegtes Teil, um es abzulegen.</p>
      </section>

      <Inventory />
    </div>
  );
}

/** Angelegte Rüstungsklassen und ihr Ausgleich (Grundlage für spätere Klassenboni). */
function ArmorClassInfo({ equipment }: { equipment: Equipment }) {
  const { pieces, mana, crit } = getArmorClassSummary(equipment);
  const worn = ARMOR_CLASSES.filter((c) => pieces[c.key] > 0);
  const perks = [mana > 0 && `+${mana} Mana`, crit > 0 && `+${(Math.round(crit * 1000) / 10).toLocaleString("de-CH")} % Krit`].filter(Boolean);
  return (
    <div className="rounded-md bg-night-800 p-2 text-center text-sm">
      <div className="text-xs text-muted">Rüstungsklassen</div>
      <div>
        {worn.length === 0
          ? "–"
          : worn.map((c) => (
              <span key={c.key} className="mx-1 whitespace-nowrap">
                {c.icon} {pieces[c.key]}× {c.label}
              </span>
            ))}
      </div>
      {perks.length > 0 && <div className="text-xs text-intellect">{perks.join(" · ")}</div>}
    </div>
  );
}

function SlotTile({ slot, className }: { slot: EquipSlot; className: string }) {
  const equipment = useGameStore((s) => s.equipment);
  const unequip = useGameStore((s) => s.unequip);
  const owned = equipment[slot];
  const stats = owned ? getItemStats(owned) : null;

  // „Waffe 2“ ist durch eine Zweihandwaffe in „Waffe 1“ belegt.
  if (slot === "weapon2" && isOffHandBlocked(equipment)) {
    const main = getItemStats(equipment.weapon1!);
    return (
      <div
        title={`Belegt durch ${itemName(main)} (Zweihand)`}
        className={`${className} flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed p-1 text-center ${RARITY_BORDER[main.rarity]} bg-night-950/60`}
      >
        <ItemIcon def={main.def} rarity={main.rarity} size={32} className="opacity-40" />
        <span className="text-[10px] leading-tight text-muted">Zweihand</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div
        title={`${SLOT_LABELS[slot]} – leer`}
        className={`${className} flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-night-600 bg-night-950/60 p-1 text-center`}
      >
        <span className="text-2xl opacity-30 grayscale" aria-hidden>
          {SLOT_ICONS[slot]}
        </span>
        <span className="w-full truncate text-[10px] leading-tight text-muted">{SLOT_LABELS[slot]}</span>
      </div>
    );
  }

  return (
    <ItemTooltip stats={stats} hint="Klicken zum Ablegen" className={`${className} flex`}>
      <button
        onClick={() => unequip(slot)}
        aria-label={`${itemName(stats)} (${rarityLabel(stats.rarity)}) ablegen`}
        className={`flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-md border-2 bg-night-800 p-1 text-center transition hover:border-danger ${RARITY_BORDER[stats.rarity]}`}
      >
        <ItemIcon def={stats.def} rarity={stats.rarity} size={32} />
        <span className={`w-full truncate text-[10px] leading-tight ${RARITY_TEXT[stats.rarity]}`}>
          {itemName(stats)}
        </span>
        {mainStatParts(stats).map((part) => (
          <span key={part.kind} className="num text-[10px] leading-none">
            {part.text}
          </span>
        ))}
      </button>
    </ItemTooltip>
  );
}

function Inventory() {
  const equip = useGameStore((s) => s.equip);

  return (
    <InventoryPanel
      emptyText="Dein Rucksack ist leer. Erledige Quests für Beute oder schau beim Händler vorbei."
      actions={(owned, stats, tooLow) =>
        slotsFor(stats.def).map((slot) => (
          <button
            key={slot}
            disabled={tooLow}
            onClick={() => equip(owned.uid, slot)}
            className="font-pixel rounded-md border-2 border-xp bg-xp/15 px-2 py-0.5 text-sm text-xp hover:bg-xp/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {stats.def.kind === "weapon" && !stats.def.twoHanded ? `→ ${SLOT_LABELS[slot]}` : "Anlegen"}
          </button>
        ))
      }
    />
  );
}

/** Kennzahl der Ausrüstung – `extra`: was aus anderen Quellen dazukommt, in Klammern. */
function CombatTile({
  label,
  value,
  extra,
  title,
  accent,
}: {
  label: string;
  value: number;
  extra?: number;
  title?: string;
  accent: string;
}) {
  return (
    <div className="rounded-md bg-night-800 p-2 text-center" title={title}>
      <div className={`num text-2xl ${accent}`}>
        {value}
        {extra !== undefined && extra !== 0 && (
          <span className="ml-1 text-sm text-muted">
            ({extra > 0 ? "+" : "−"}
            {Math.abs(extra)})
          </span>
        )}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
