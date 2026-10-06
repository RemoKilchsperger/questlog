import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { getItemStats } from "../domain/items";
import { POINTS_PER_LEVEL } from "../domain/leveling";
import { getPotion } from "../domain/potions";
import { SKILL_POINTS_PER_LEVEL } from "../domain/skills";
import { sfx } from "../game/sfx";
import type { SpriteDef } from "../game/sprites";
import type { ClaimedChest } from "../store/gameStore";
import { Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { itemName, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";
import { PixelSprite } from "./PixelSprite";

const CHEST_PALETTE = {
  d: "#4a2e18", // dunkles Holz / Kanten
  b: "#8a5a2b", // Holz
  B: "#6e4420", // Holz, Maserung
  g: "#f4c95d", // Goldbeschlag
  G: "#a8781e", // Goldbeschlag dunkel (Schloss)
  y: "#fff1a8", // Leuchten im Inneren
};

const CLOSED_CHEST: SpriteDef = {
  grid: [
    "..dddddddddd..",
    ".dbbbbbbbbbbd.",
    "dbbbbbbbbbbbbd",
    "dbBBBBBBBBBBbd",
    "gggggggggggggg",
    "dbbbbbgGbbbbbd",
    "dbbbbbgGbbbbbd",
    "dbbbbbbbbbbbbd",
    "dbBBBBBBBBBBbd",
    "dbbbbbbbbbbbbd",
    "dddddddddddddd",
  ],
  palette: CHEST_PALETTE,
};

const OPEN_CHEST: SpriteDef = {
  grid: [
    ".dbbbbbbbbbbd.",
    "dbBBBBBBBBBBbd",
    "dbbbbbbbbbbbbd",
    "gggggggggggggg",
    "dyyyyyyyyyyyyd",
    "gggggggggggggg",
    "dbbbbbgGbbbbbd",
    "dbbbbbgGbbbbbd",
    "dbBBBBBBBBBBbd",
    "dbbbbbbbbbbbbd",
    "dddddddddddddd",
  ],
  palette: CHEST_PALETTE,
};

/** Abstand, in dem die Belohnungen nacheinander aus der Truhe erscheinen. */
const STAGGER = 0.18;

/**
 * Dungeon-Truhe: wackelt geschlossen, springt beim Klick mit Lichtschein auf
 * und gibt die Belohnungen nacheinander frei. Gutgeschrieben ist die Beute
 * schon (siehe gameStore) – die Truhe ist nur die Darstellung.
 */
export function DungeonChest({ chest }: { chest: ClaimedChest }) {
  const [open, setOpen] = useState(false);
  const potions = Object.entries(chest.potions).map(([id, count]) => ({ def: getPotion(id), count }));
  const levelUps = chest.levelAfter - chest.levelBefore;
  const empty = chest.xp === 0 && chest.gold === 0 && chest.items.length === 0 && potions.length === 0;

  const openChest = () => {
    if (open) return;
    setOpen(true);
    sfx.chest();
  };

  // Reihenfolge der Enthüllung: XP & Gold, Level-up, Tränke, Items
  let step = 0;
  const next = () => 0.35 + STAGGER * step++;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        onClick={openChest}
        disabled={open}
        aria-label={open ? "Geöffnete Truhe" : "Truhe öffnen"}
        className="relative flex h-40 w-48 items-end justify-center"
      >
        <AnimatePresence>
          {open && (
            <motion.span
              key="light"
              aria-hidden
              className="chest-light pointer-events-none absolute -inset-x-8 -top-8 bottom-0"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        <motion.span
          key={open ? "open" : "closed"}
          className="relative"
          initial={open ? { scale: 0.8, y: 6 } : false}
          animate={
            open
              ? { scale: [0.8, 1.15, 1], y: [6, -10, 0] }
              : { rotate: [0, -4, 4, -3, 3, 0], y: [0, -2, 0, -2, 0, 0] }
          }
          transition={
            open ? { duration: 0.45, ease: "easeOut" } : { duration: 0.9, repeat: Infinity, repeatDelay: 0.8 }
          }
        >
          <PixelSprite sprite={open ? OPEN_CHEST : CLOSED_CHEST} size={128} />
        </motion.span>
      </button>

      {!open ? (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={openChest}
          className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-5 py-2 text-lg text-legendary hover:bg-legendary/25"
        >
          🧰 Truhe öffnen
        </motion.button>
      ) : empty ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted">
          Die Truhe ist leer – du hast noch keinen Kampf gewonnen.
        </motion.p>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <Reveal delay={next()}>
            <p>
              <span className="num text-xp">+{chest.xp} XP</span>
              {chest.gold > 0 && (
                <>
                  {" · "}
                  <Gold amount={chest.gold} className="font-bold text-gold" />
                </>
              )}
            </p>
          </Reveal>
          {levelUps > 0 && (
            <Reveal delay={next()}>
              <p className="font-pixel text-2xl text-gold">
                LEVEL UP! → <span className="num">{chest.levelAfter}</span>
                <span className="block font-sans text-sm text-xp">
                  +{levelUps * POINTS_PER_LEVEL} Attributpunkte und +{levelUps * SKILL_POINTS_PER_LEVEL} Skillpunkt
                  {levelUps > 1 ? "e" : ""}
                </span>
              </p>
            </Reveal>
          )}
          {potions.length > 0 && (
            <Reveal delay={next()}>
              <p className="text-sm">
                {potions.map(({ def, count }, i) => (
                  <span key={def.id} className="font-bold text-xp">
                    {i > 0 && " · "}
                    {count}× {def.icon} {def.name}
                  </span>
                ))}
              </p>
            </Reveal>
          )}
          {chest.items.map((owned) => {
            const stats = getItemStats(owned);
            const boss = stats.def.bossId !== undefined;
            return (
              <Reveal key={owned.uid} delay={next()} pop={boss}>
                <div
                  className={`flex w-full items-center gap-3 rounded-md border-2 bg-night-800 p-2 text-left ${RARITY_BORDER[stats.rarity]}`}
                >
                  <ItemIcon def={stats.def} rarity={stats.rarity} size={40} />
                  <div className="min-w-0">
                    {boss && <p className="text-xs text-legendary">👑 Boss-Beute</p>}
                    <p className={`truncate font-semibold ${RARITY_TEXT[stats.rarity]}`}>{itemName(stats)}</p>
                    <p className="text-xs text-muted">
                      {rarityLabel(stats.rarity)} · {mainStatText(stats)}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
          {chest.items.length === 0 && (
            <Reveal delay={next()}>
              <p className="text-sm text-muted">Diesmal waren keine Items dabei.</p>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}

/** Eine Belohnung springt verzögert aus der Truhe; Boss-Beute etwas kräftiger. */
function Reveal({ delay, pop = false, children }: { delay: number; pop?: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: -24, scale: pop ? 0.5 : 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: pop ? 260 : 320, damping: pop ? 11 : 20 }}
    >
      {children}
    </motion.div>
  );
}
