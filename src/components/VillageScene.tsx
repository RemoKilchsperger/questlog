import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isQuestComplete } from "../domain/quests";
import { BUILDINGS, canBuild, maxTier, type BuildingDef, type BuildingId } from "../domain/village";
import { chapterQuest, getFixedVisitor, wandererTemplate } from "../domain/visitors";
import { BG_HEIGHT, paintVillage, VILLAGE_WIDTH } from "../game/backgrounds";
import { sfx } from "../game/sfx";
import { renderSprite } from "../game/sprites";
import { getBuildingSprite, VILLAGE_SLOTS } from "../game/villageSprites";
import { getVisitorSprite } from "../game/visitorSprites";
import { useGameStore } from "../store/gameStore";
import { useReadyMissions } from "./CompanionScreen";
import { Hint } from "./HoverCard";
import { spriteUrl } from "./spriteImage";
import { useNow } from "./useNow";
import { VisitorDialog, type VisitorKind } from "./VisitorDialog";

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
  const [talking, setTalking] = useState<VisitorKind | null>(null);

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
      <Visitors onTalk={setTalking} />
      <RaidWarning />
      <VisitorDialog who={talking} onClose={() => setTalking(null)} />
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
  const damaged = useGameStore((s) => s.raids.damaged.includes(def.id));

  const current = def.tiers[tier];
  const plot = tier === 0 && def.id !== "merchant";
  const name = plot ? `${def.name}: Bauplatz` : `${def.name}: ${current.name}`;
  const hint = [
    tier === maxTier(def.id) ? "Ganz ausgebaut." : `Stufe ${tier} von ${maxTier(def.id)}.`,
    damaged && "🔥 Beschädigt – wirkt eine Stufe tiefer, bis du es reparierst.",
    plot ? "Klicken zum Bauen." : `Klicken zum Öffnen${buildable ? ", 🔨 zum Ausbauen" : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

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
      {def.id === "tavern" && <MissionsReady />}
      {damaged && <Flames />}
      <AnimatePresence>{built && <Dust key={tier} />}</AnimatePresence>
    </div>
  );
}

/** Plätze der Besucher im Dorfbild: der feste vor dem Händler, der Durchreisende am anderen Ende. */
const VISITOR_SPOTS: Record<VisitorKind, number> = { story: 45, wanderer: 256 };
/** Unterkante der Figuren – vor den Gebäuden auf der Strasse. */
const VISITOR_BASE = 78;

/** Die Besucher im Dorf – sie kommen und gehen auch, während das Dorf offen ist. */
function Visitors({ onTalk }: { onTalk: (who: VisitorKind) => void }) {
  const visitors = useGameStore((s) => s.visitors);
  const refresh = useGameStore((s) => s.refreshVisitors);
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  useEffect(() => refresh(), [refresh, minute]);

  const { story, wanderer } = visitors;
  return (
    <>
      {story && (
        <VisitorSpot
          who="story"
          spriteKey={story.id}
          name={`${getFixedVisitor(story.id).name}, ${getFixedVisitor(story.id).role}`}
          marker={!story.accepted ? "!" : isQuestComplete(chapterQuest(getFixedVisitor(story.id), story.chapter), story.progress) ? "?" : null}
          onTalk={onTalk}
        />
      )}
      {wanderer && (
        <VisitorSpot
          who="wanderer"
          spriteKey={wanderer.kind}
          name={`${wandererTemplate(wanderer.kind).name}, ${wandererTemplate(wanderer.kind).role}`}
          marker={!wanderer.accepted ? "!" : isQuestComplete(wanderer.quest, wanderer.progress) ? "?" : null}
          onTalk={onTalk}
        />
      )}
    </>
  );
}

function VisitorSpot({
  who,
  spriteKey,
  name,
  marker,
  onTalk,
}: {
  who: VisitorKind;
  spriteKey: string;
  name: string;
  /** „!“: hat etwas zu erzählen, „?“: wartet auf die Abgabe */
  marker: "!" | "?" | null;
  onTalk: (who: VisitorKind) => void;
}) {
  const sprite = getVisitorSprite(spriteKey);
  const { width, height } = useMemo(() => renderSprite(sprite), [sprite]);
  const x = VISITOR_SPOTS[who];
  const hint = marker === "!" ? "Hat dir etwas zu erzählen." : marker === "?" ? "Wartet auf dich – erfüllt!" : "Klicken zum Reden.";
  return (
    <motion.div
      className="absolute"
      style={{ left: pctX(x - width / 2), top: pctY(VISITOR_BASE - height), width: pctX(width), height: pctY(height) }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Hint heading={name} text={hint} className="block h-full w-full">
        <button
          type="button"
          onClick={() => onTalk(who)}
          aria-label={`${name} – ${hint}`}
          className="group block h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-gold"
        >
          <img src={spriteUrl(sprite)} alt="" draggable={false} className="pixelated block h-full w-full group-hover:brightness-125" />
        </button>
      </Hint>
      {marker && (
        <motion.span
          aria-hidden
          className={`font-pixel pointer-events-none absolute left-1/2 -top-5 text-xl font-bold drop-shadow sm:-top-8 sm:text-4xl ${
            marker === "?" ? "text-xp" : "text-gold"
          }`}
          style={{ x: "-50%" }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        >
          {marker}
        </motion.span>
      )}
    </motion.div>
  );
}

/** Schriftrolle über der Taverne, sobald Begleiter mit einem Bericht zurück sind. */
function MissionsReady() {
  const ready = useReadyMissions();
  if (ready === 0) return null;
  const text = ready === 1 ? "Eine Mission ist fertig" : `${ready} Missionen sind fertig`;
  return (
    <motion.span
      aria-label={text}
      title={text}
      className="pointer-events-none absolute -top-2 right-0 text-base drop-shadow sm:-top-4 sm:text-2xl"
      animate={{ y: [0, -6, 0], rotate: [0, -8, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    >
      📜
    </motion.span>
  );
}

/** Flackernde Flammen auf einem Gebäude, das ein Überfall beschädigt hat. */
function Flames() {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -top-1 left-0 text-base drop-shadow sm:-top-3 sm:text-2xl"
      animate={{ scale: [1, 1.15, 0.95, 1], opacity: [0.9, 1, 0.8, 0.9] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
    >
      🔥
    </motion.span>
  );
}

/** Gekreuzte Schwerter am Dorfrand, solange eine Bande anrückt – ein Klick führt zur Ankündigung. */
function RaidWarning() {
  const coming = useGameStore((s) => s.raids.current !== null);
  if (!coming) return null;
  return (
    <motion.button
      type="button"
      onClick={() => document.getElementById("raid")?.scrollIntoView({ behavior: "smooth", block: "center" })}
      aria-label="Eine Bande zieht aufs Dorf zu"
      title="Eine Bande zieht aufs Dorf zu"
      className="absolute left-1 top-1 cursor-pointer rounded-md bg-danger/80 px-1 text-base drop-shadow sm:left-2 sm:top-2 sm:px-2 sm:text-2xl"
      animate={{ scale: [1, 1.12, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
    >
      ⚔️
    </motion.button>
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
