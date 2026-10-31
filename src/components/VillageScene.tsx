import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDINGS, canBuild, MAX_BUILDING_TIER, type BuildingDef, type BuildingId } from "../domain/village";
import { BG_HEIGHT, paintVillage, VILLAGE_WIDTH } from "../game/backgrounds";
import { sfx } from "../game/sfx";
import { renderSprite } from "../game/sprites";
import { getBuildingSprite, VILLAGE_SLOTS } from "../game/villageSprites";
import { useGameStore } from "../store/gameStore";
import { Hint } from "./HoverCard";
import { spriteUrl } from "./spriteImage";

/** Anteil am Dorfbild in Prozent – das Bild wächst mit der Breite mit. */
const pctX = (px: number) => `${(px / VILLAGE_WIDTH) * 100}%`;
const pctY = (px: number) => `${(px / BG_HEIGHT) * 100}%`;

/**
 * Das Dorf als Pixel-Bild: Hintergrund aus backgrounds.ts, darüber die sieben
 * Gebäude auf ihrer Stufe. Der Hintergrund wächst mit der Summe aller Stufen mit.
 */
export function VillageScene({
  onSelect,
  onBuild,
}: {
  /** Klick auf ein Gebäude */
  onSelect: (def: BuildingDef) => void;
  /** Klick auf den Hammer über einem Gebäude, das man gerade ausbauen kann */
  onBuild: (def: BuildingDef) => void;
}) {
  const village = useGameStore((s) => s.village);
  const progress = Object.values(village).reduce<number>((sum, tier) => sum + tier, 0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, VILLAGE_WIDTH, BG_HEIGHT);
    paintVillage(ctx, progress);
  }, [progress]);

  return (
    <section className="panel relative overflow-hidden p-0" aria-label="Dein Dorf">
      <canvas ref={canvas} width={VILLAGE_WIDTH} height={BG_HEIGHT} className="pixelated block w-full" />
      {VILLAGE_SLOTS.map((slot) => (
        <BuildingSpot
          key={slot.id}
          def={BUILDINGS.find((b) => b.id === slot.id)!}
          x={slot.x}
          base={slot.base}
          onSelect={onSelect}
          onBuild={onBuild}
        />
      ))}
    </section>
  );
}

function BuildingSpot({
  def,
  x,
  base,
  onSelect,
  onBuild,
}: {
  def: BuildingDef;
  x: number;
  base: number;
  onSelect: (def: BuildingDef) => void;
  onBuild: (def: BuildingDef) => void;
}) {
  const tier = useGameStore((s) => s.village[def.id]);
  const buildable = useGameStore((s) => canBuild(s.village, def.id, s.character.gold, s.materials));
  const sprite = getBuildingSprite(def.id, tier);
  const { width, height } = useMemo(() => renderSprite(sprite), [sprite]);
  const built = useJustBuilt(def.id, tier);

  const current = def.tiers[tier];
  const plot = tier === 0 && def.id !== "merchant";
  const name = plot ? `${def.name}: Bauplatz` : `${def.name}: ${current.name}`;
  const hint = [
    tier === MAX_BUILDING_TIER ? "Ganz ausgebaut." : `Stufe ${tier} von ${MAX_BUILDING_TIER}.`,
    plot ? "Klicken zum Bauen." : `Klicken zum Öffnen${buildable ? ", 🔨 zum Ausbauen" : ""}.`,
  ].join(" ");

  return (
    <div
      className="absolute"
      style={{ left: pctX(x - width / 2), top: pctY(base - height), width: pctX(width), height: pctY(height) }}
    >
      <Hint heading={name} text={hint} className="block h-full w-full">
        <button
          type="button"
          onClick={() => onSelect(def)}
          aria-label={`${name} – ${hint}`}
          className="group block h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-gold"
        >
          <motion.img
            key={tier}
            src={spriteUrl(sprite)}
            alt=""
            draggable={false}
            initial={built ? { scaleY: 0.4, scaleX: 1.2 } : false}
            animate={{ scaleY: 1, scaleX: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 12 }}
            style={{ originY: 1 }}
            className="pixelated block h-full w-full transition-[filter] group-hover:brightness-125"
          />
        </button>
      </Hint>
      {buildable && (
        <motion.button
          type="button"
          onClick={() => onBuild(def)}
          aria-label={`${def.name} ausbauen`}
          title={`${def.name} ausbauen`}
          className="absolute left-1/2 -top-2 cursor-pointer text-base drop-shadow sm:-top-4 sm:text-2xl"
          style={{ x: "-50%" }}
          animate={{ y: [0, -6, 0] }}
          whileHover={{ scale: 1.25 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          🔨
        </motion.button>
      )}
      <AnimatePresence>{built && <Dust key={tier} />}</AnimatePresence>
    </div>
  );
}

/** Wurde das Gebäude gerade ausgebaut? (nicht beim ersten Anzeigen) – spielt dann den Bau-Sound. */
function useJustBuilt(id: BuildingId, tier: number): boolean {
  const previous = useRef(tier);
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    const grew = tier > previous.current;
    previous.current = tier;
    if (!grew) return;
    setBuilt(true);
    sfx.hit(false, true);
    const timer = setTimeout(() => setBuilt(false), 900);
    return () => clearTimeout(timer);
  }, [id, tier]);
  return built;
}

/** Staubwolken am Fuss des Gebäudes. */
function Dust() {
  return (
    <>
      {[-1, -0.5, 0.5, 1].map((dir) => (
        <motion.span
          key={dir}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-3 w-3 rounded-full bg-parchment/70 sm:h-5 sm:w-5"
          initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.6 }}
          animate={{ x: `${dir * 220}%`, y: "-80%", opacity: 0, scale: 1.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      ))}
    </>
  );
}
