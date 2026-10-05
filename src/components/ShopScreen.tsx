import { motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatCountdown, nextBoundary } from "../domain/calendar";
import { getItemStats, sellPrice } from "../domain/items";
import { getLevel } from "../domain/leveling";
import { potionEffectText, SHOP_POTIONS } from "../domain/potions";
import {
  canReroll,
  rerollCost,
  SHOP_EPIC_CHANCE,
  SHOP_ROTATION_HOURS,
  SHOP_SIZE,
  shopPrice,
  shopSlot,
} from "../domain/shop";
import type { OwnedItem } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Gold } from "./Gold";
import { InventoryPanel } from "./InventoryPanel";
import { ItemIcon } from "./ItemIcon";
import { ItemRow } from "./ItemRow";
import { POTION_COLORS } from "./potionUi";
import { RARITY_TEXT, rarityLabel } from "./itemUi";
import { useNow } from "./useNow";

export function ShopScreen() {
  const sell = useGameStore((s) => s.sell);
  const [pendingSale, setPendingSale] = useState<OwnedItem | null>(null);
  const cancelSale = useCallback(() => setPendingSale(null), []);
  const sale = pendingSale ? getItemStats(pendingSale) : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Offers />

      <InventoryPanel
        title="Verkaufen"
        emptyText="Du hast nichts zu verkaufen. Erledige Quests für Beute."
        actions={(owned) => (
          <button
            onClick={() => setPendingSale(owned)}
            className="rounded-md border-2 border-gold/60 px-2 py-0.5 text-sm text-gold hover:bg-gold/15"
          >
            Verkaufen <Gold amount={sellPrice(owned)} sign />
          </button>
        )}
      />

      <ConfirmDialog
        open={sale !== null}
        title="Item verkaufen?"
        confirmLabel="Verkaufen"
        onCancel={cancelSale}
        onConfirm={() => {
          if (pendingSale) sell(pendingSale.uid);
          setPendingSale(null);
        }}
      >
        {sale && pendingSale && (
          <>
            <p>
              <span className={`font-semibold ${RARITY_TEXT[sale.rarity]}`}>
                <ItemIcon def={sale.def} rarity={sale.rarity} size={24} /> {sale.def.name}
              </span>{" "}
              <span className="text-muted">({rarityLabel(sale.rarity)})</span>
            </p>
            <p className="mt-2">
              Du erhältst <Gold amount={sellPrice(pendingSale)} className="font-bold text-gold" />. Das Item ist danach
              weg.
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

type View = "wares" | "potions";

function Offers() {
  const gold = useGameStore((s) => s.character.gold);
  const [view, setView] = useState<View>("wares");

  return (
    <section className="panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">Händler</h2>
        <Gold amount={gold} className="text-lg font-bold text-gold" />
      </div>
      <div className="mb-3 flex gap-1">
        <ViewChip active={view === "wares"} onClick={() => setView("wares")}>
          🎒 Ware
        </ViewChip>
        <ViewChip active={view === "potions"} onClick={() => setView("potions")}>
          🧪 Tränke
        </ViewChip>
      </div>
      {view === "wares" ? <WareOffers /> : <PotionOffers />}
    </section>
  );
}

/** Die wechselnde Ware: höchstens 5 Stücke, alle 4 Stunden neu, eines davon selten. */
function WareOffers() {
  const now = useNow();
  const slot = shopSlot(now);
  const gold = useGameStore((s) => s.character.gold);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const equipment = useGameStore((s) => s.equipment);
  const shop = useGameStore((s) => s.shop);
  const refreshShop = useGameStore((s) => s.refreshShop);
  const buyOffer = useGameStore((s) => s.buyOffer);
  const lastReroll = useGameStore((s) => s.lastShopReroll);
  const rerollShop = useGameStore((s) => s.rerollShop);
  const [confirmReroll, setConfirmReroll] = useState(false);
  const closeReroll = useCallback(() => setConfirmReroll(false), []);
  const cost = rerollCost(level);
  const rerollAvailable = canReroll(lastReroll, now);

  // Neuer Abschnitt → neue Ware (auch wenn die Seite offen bleibt).
  useEffect(() => refreshShop(), [slot, refreshShop]);
  // Bis die neue Ware ausgewürfelt ist (direkt nach dem ersten Zeichnen), nichts Veraltetes zeigen.
  if (shop.slot !== slot) return null;
  const offers = shop.offers;

  return (
    <>
      <p className="mb-2 text-xs text-muted">
        Alle {SHOP_ROTATION_HOURS} Stunden komplett neue Ware passend zu deinem Level – ein Stück ist immer{" "}
        <span className="text-rare">selten</span>, mit {Math.round(SHOP_EPIC_CHANCE * 100)} % Glück ist zusätzlich
        eines <span className="text-epic">episch</span>. Neue Ware in{" "}
        <span className="text-parchment">{formatCountdown(now, nextBoundary(now, SHOP_ROTATION_HOURS))}</span>.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          disabled={!rerollAvailable || gold < cost}
          onClick={() => setConfirmReroll(true)}
          className="rounded-md border-2 border-epic/70 bg-epic/10 px-3 py-1 text-sm text-epic hover:bg-epic/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={!rerollAvailable ? "Heute schon genutzt" : gold < cost ? "Nicht genug Gold" : "Sofort neue Ware"}
        >
          🎲 Neue Ware <Gold amount={cost} className="font-bold" />
        </motion.button>
        <span className="text-xs text-muted">
          {rerollAvailable ? "1× pro Tag möglich" : "Heute schon genutzt – morgen wieder"}
        </span>
      </div>
      <ConfirmDialog
        open={confirmReroll}
        title="Neue Ware auswürfeln?"
        confirmLabel="Auswürfeln"
        onCancel={closeReroll}
        onConfirm={() => {
          rerollShop();
          setConfirmReroll(false);
        }}
      >
        <p>
          Für <Gold amount={cost} className="font-bold text-gold" /> ersetzt der Händler sein ganzes Angebot sofort
          durch neue Ware. Das geht nur einmal pro Tag.
        </p>
      </ConfirmDialog>
      {offers.length === 0 ? (
        <p className="text-sm text-muted">Ausverkauft! Schau nach dem nächsten Wechsel wieder vorbei.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {offers.map((offer) => {
            const stats = getItemStats(offer);
            const price = shopPrice(offer);
            const tooLow = level < stats.def.requiredLevel;
            const tooPoor = gold < price;
            return (
              <ItemRow key={offer.uid} stats={stats} equipment={equipment} tooLow={tooLow}>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  disabled={tooLow || tooPoor}
                  onClick={() => buyOffer(offer.uid)}
                  className="rounded-md border-2 border-gold bg-gold/15 px-2 py-0.5 text-sm text-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                  title={tooLow ? `Benötigt Level ${stats.def.requiredLevel}` : tooPoor ? "Nicht genug Gold" : "Kaufen"}
                >
                  <Gold amount={price} className="font-bold" />
                </motion.button>
              </ItemRow>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-right text-xs text-muted">
        {offers.length} von {SHOP_SIZE} Stücken übrig
      </p>
    </>
  );
}

function PotionOffers() {
  const gold = useGameStore((s) => s.character.gold);
  const potions = useGameStore((s) => s.potions);
  const buyPotion = useGameStore((s) => s.buyPotion);

  return (
    <>
      <p className="mb-2 text-xs text-muted">
        Heiltränke stellen im Kampf Lebenspunkte wieder her. Pro Runde darfst du einen Trank trinken – und jede Sorte
        nur einmal pro Kampf. Grosse Heiltränke sowie Angriffs- und Rüstungstränke gibt es nicht zu kaufen, nur als
        Kampfbeute.
      </p>
      <ul className="flex flex-col gap-2">
        {SHOP_POTIONS.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2">
            <span className="text-2xl" aria-hidden>
              {p.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs">
                <span className={POTION_COLORS[p.effect.kind]}>{potionEffectText(p)}</span>
                <span className="ml-2 text-muted">im Besitz: {potions[p.id] ?? 0}</span>
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              disabled={gold < (p.price ?? Infinity)}
              onClick={() => buyPotion(p.id)}
              title={gold < (p.price ?? Infinity) ? "Nicht genug Gold" : "Kaufen"}
              className="rounded-md border-2 border-gold bg-gold/15 px-2 py-0.5 text-sm text-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Gold amount={p.price ?? 0} className="font-bold" />
            </motion.button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ViewChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border-2 px-3 py-1 text-sm ${
        active ? "border-gold text-gold" : "border-night-700 text-muted hover:text-parchment"
      }`}
    >
      {children}
    </button>
  );
}
