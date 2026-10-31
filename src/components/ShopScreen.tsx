import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { formatCountdown, nextBoundary } from "../domain/calendar";
import { bulkSellableItems } from "../domain/equipment";
import { getItemStats, sellPrice as baseSellPrice } from "../domain/items";
import { getLevel } from "../domain/leveling";
import { POTIONS } from "../domain/potions";
import { rerollCost, rerollsLeft, SHOP_ROTATION_HOURS, shopPrice, shopSlot } from "../domain/shop";
import type { OwnedItem, Rarity } from "../domain/types";
import { getBuilding, MERCHANT_RULES } from "../domain/village";
import { useGameStore } from "../store/gameStore";
import { PotionList } from "./AlchemistScreen";
import { ConfirmDialog } from "./ConfirmDialog";
import { Gold } from "./Gold";
import { InventoryPanel } from "./InventoryPanel";
import { ItemIcon } from "./ItemIcon";
import { ItemRow } from "./ItemRow";
import { itemName, RARITY_TEXT, rarityLabel } from "./itemUi";
import { useNow } from "./useNow";

/** Regeln des Händlers auf seiner aktuellen Ausbaustufe (village.ts). */
function useMerchant() {
  const tier = useGameStore((s) => s.village.merchant);
  return { tier, rules: MERCHANT_RULES[tier], name: getBuilding("merchant").tiers[tier].name };
}

export function ShopScreen() {
  const sell = useGameStore((s) => s.sell);
  const { rules } = useMerchant();
  const sellPrice = (owned: OwnedItem) => baseSellPrice(owned, rules.sellBonus);
  const [pendingSale, setPendingSale] = useState<OwnedItem | null>(null);
  const cancelSale = useCallback(() => setPendingSale(null), []);
  const sale = pendingSale ? getItemStats(pendingSale) : null;
  const sellCommon = useGameStore((s) => s.sellCommon);
  const inventory = useGameStore((s) => s.inventory);
  const commons = bulkSellableItems(inventory);
  const commonTotal = commons.reduce((sum, owned) => sum + sellPrice(owned), 0);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const cancelBulk = useCallback(() => setConfirmBulk(false), []);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Offers />

      <InventoryPanel
        title="Verkaufen"
        emptyText="Du hast nichts zu verkaufen. Erledige Quests für Beute."
        toolbar={
          commons.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setConfirmBulk(true)}
                className="rounded-md border-2 border-gold/60 px-3 py-1 text-sm text-gold hover:bg-gold/15"
              >
                Alle gewöhnlichen verkaufen ({commons.length}) <Gold amount={commonTotal} sign />
              </button>
            </div>
          )
        }
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
                <ItemIcon def={sale.def} rarity={sale.rarity} size={24} /> {itemName(sale)}
              </span>{" "}
              <span className="text-muted">({rarityLabel(sale.rarity)})</span>
            </p>
            <p className="mt-2">
              Du erhältst <Gold amount={sellPrice(pendingSale)} className="font-bold text-gold" />. Das Item ist danach
              weg.
            </p>
            {sale.upgrade > 0 && (
              <p className="mt-2 text-sm text-essence">
                Achtung: Die Verbesserung +{sale.upgrade} geht beim Verkauf verloren. Beim Schmied bekommst du beim
                Zerlegen die Hälfte der Essenz zurück.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmBulk}
        title="Alle gewöhnlichen Items verkaufen?"
        confirmLabel="Alle verkaufen"
        onCancel={cancelBulk}
        onConfirm={() => {
          sellCommon();
          setConfirmBulk(false);
        }}
      >
        <p>
          Du verkaufst {commons.length} gewöhnliche {commons.length === 1 ? "Item" : "Items"} und erhältst{" "}
          <Gold amount={commonTotal} className="font-bold text-gold" />. Die Items sind danach weg.
        </p>
        <p className="mt-2 text-sm text-muted">
          Angelegte und verbesserte Items behältst du.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function Offers() {
  const gold = useGameStore((s) => s.character.gold);
  const { name } = useMerchant();
  const alchemistBuilt = useGameStore((s) => s.village.alchemist > 0);

  return (
    <section className="panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">{name}</h2>
        <Gold amount={gold} className="text-lg font-bold text-gold" />
      </div>
      <WareOffers />
      {/* Bis der Alchemist steht, hat der Händler ein paar kleine Heiltränke – danach gibt es Tränke nur dort. */}
      {!alchemistBuilt && (
        <div className="mt-4">
          <h3 className="font-pixel mb-1 text-lg">🧪 Tränke</h3>
          <p className="mb-2 text-xs text-muted">Weitere Tränke verkauft der Alchemist, sobald du ihn gebaut hast.</p>
          <PotionList potions={POTIONS.filter((p) => p.alchemist === 0)} />
        </div>
      )}
    </section>
  );
}

/** Die wechselnde Ware: höchstens 8 Stücke, alle 4 Stunden neu, jedes mit eigener Seltenheit. */
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
  const rerollCount = useGameStore((s) => s.shopRerolls);
  const rerollShop = useGameStore((s) => s.rerollShop);
  const { rules } = useMerchant();
  const [confirmReroll, setConfirmReroll] = useState(false);
  const closeReroll = useCallback(() => setConfirmReroll(false), []);
  const cost = rerollCost(level);
  const left = rerollsLeft(lastReroll, rerollCount, now, rules.rerollsPerDay);
  const rerollAvailable = left > 0;

  // Neuer Abschnitt → neue Ware (auch wenn die Seite offen bleibt).
  useEffect(() => refreshShop(), [slot, refreshShop]);
  // Bis die neue Ware ausgewürfelt ist (direkt nach dem ersten Zeichnen), nichts Veraltetes zeigen.
  if (shop.slot !== slot) return null;
  const offers = shop.offers;

  return (
    <>
      <p className="mb-2 text-xs text-muted">
        Alle {SHOP_ROTATION_HOURS} Stunden {rules.size} neue Stücke passend zu deinem Level – jedes kann{" "}
        <RarityChances chances={rules.rarityChances} /> sein. Neue Ware in{" "}
        <span className="text-parchment">{formatCountdown(now, nextBoundary(now, SHOP_ROTATION_HOURS))}</span>.
        {rules.sellBonus > 0 && <> Beim Verkauf zahlt der Grosshandel {Math.round(rules.sellBonus * 100)} % mehr.</>}
      </p>
      {rules.rerollsPerDay === 0 ? (
        <p className="mb-3 text-xs text-muted">
          Der Strassenhändler kann keine neue Ware holen – baue ihn im Dorf aus, dann geht das gegen Gold.
        </p>
      ) : (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          disabled={!rerollAvailable || gold < cost}
          onClick={() => setConfirmReroll(true)}
          className="rounded-md border-2 border-epic/70 bg-epic/10 px-3 py-1 text-sm text-epic hover:bg-epic/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={!rerollAvailable ? "Heute aufgebraucht" : gold < cost ? "Nicht genug Gold" : "Sofort neue Ware"}
        >
          🎲 Neue Ware <Gold amount={cost} className="font-bold" />
        </motion.button>
        <span className="text-xs text-muted">
          {rerollAvailable ? `Heute noch ${left} von ${rules.rerollsPerDay}×` : "Heute aufgebraucht – morgen wieder"}
        </span>
      </div>
      )}
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
          durch neue Ware. Das geht {rules.rerollsPerDay}-mal pro Tag – heute noch {left}-mal.
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
              <ItemRow key={offer.uid} owned={offer} stats={stats} equipment={equipment} tooLow={tooLow}>
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
        {offers.length} von {rules.size} Stücken übrig
      </p>
    </>
  );
}

const RARITY_NAMES: Record<Rarity, { label: string; className: string }> = {
  common: { label: "gewöhnlich", className: "text-parchment" },
  rare: { label: "selten", className: "text-rare" },
  epic: { label: "episch", className: "text-epic" },
  legendary: { label: "legendär", className: "text-legendary" },
};

/** „selten (20 %), episch (5 %) oder legendär (0,2 %)“ */
function RarityChances({ chances }: { chances: readonly { rarity: Rarity; chance: number }[] }) {
  const sorted = [...chances].reverse();
  return (
    <>
      {sorted.map(({ rarity, chance }, i) => (
        <span key={rarity}>
          {i > 0 && (i === sorted.length - 1 ? " oder " : ", ")}
          <span className={RARITY_NAMES[rarity].className}>{RARITY_NAMES[rarity].label}</span> (
          {(chance * 100).toLocaleString("de-CH")} %)
        </span>
      ))}
    </>
  );
}
