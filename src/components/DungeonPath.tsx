// Wege durch die Dungeons (docs/dungeon-wege.md): Fortschritt, Türen an den Gabelungen
// und die Räume ohne Kampf (Schrein, Händler, Falle, Rätsel, Truhe, Schatzraum).

import { motion } from "motion/react";
import { Fragment } from "react";
import { chestCount, type BattleReward, type BattleState } from "../domain/combat";
import { getDungeon, type AreaDef } from "../domain/creatures";
import { getRiddle, getTrap, ROOMS, stepKind, type ChestChoice, type Door, type MerchantOffer } from "../domain/dungeonPaths";
import { getPotion, potionEffectText } from "../domain/potions";
import { getBlessing, stacks } from "../domain/tower";
import { materialEntries } from "../domain/village";
import { isRoomDone, useGameStore, type DungeonRoom, type DungeonRun } from "../store/gameStore";
import { DungeonChest } from "./DungeonChest";
import { Gold } from "./Gold";
import { MaterialGain } from "./materialUi";
import { BlessingChip } from "./TowerScreen";
import { TreasureFindCard } from "./TreasureMaps";

/** Kurzer Hinweis, was in die Truhe gewandert ist (nach einem Sieg oder aus einem Raum). */
export function ChestDeposit({ reward }: { reward: BattleReward }) {
  const things = [reward.bossLoot, reward.loot].filter((i) => i !== null).length;
  const potions = (reward.potions?.count ?? 0) + (reward.buffPotion ? 1 : 0);
  // Nur was dazukam, mit Trennpunkten dazwischen (aus Fallen und Rätseln gibt es keine XP)
  const parts = [
    reward.xp > 0 && <span className="num text-xp">+{reward.xp} XP</span>,
    reward.gold > 0 && <Gold amount={reward.gold} className="font-bold text-gold" />,
    potions > 0 && <span className="text-xp">{potions}× Trank</span>,
    materialEntries(reward.materials).length > 0 && <MaterialGain materials={reward.materials} />,
    things > 0 && (
      <span className={reward.bossLoot ? "text-legendary" : "text-epic"}>
        {things} {things === 1 ? "Item" : "Items"}
        {reward.bossLoot && " 👑"}
      </span>
    ),
  ].filter(Boolean);
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-md bg-night-800 px-3 py-1.5 text-sm"
    >
      🧰 In die Truhe:{" "}
      {parts.length === 0
        ? "nichts"
        : parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              {part}
            </Fragment>
          ))}
    </motion.p>
  );
}

/** Weg durch den Dungeon als Leiste: bisherige Räume, aktueller Schritt, Gabelungen und Bosse voraus. */
export function DungeonProgress({ area }: { area: AreaDef }) {
  const run = useGameStore((s) => s.dungeon);
  if (!run) return null;
  const unique = [...new Set(run.blessings)];
  return (
    <div className="mb-3 flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Weg durch den Dungeon">
        <span className="text-muted">
          Schritt <span className="num text-parchment">{run.stage + 1}</span>/{area.creatures.length} · keine Heilung im Dungeon
        </span>
        {area.creatures.map((creature, i) => {
          const kind = stepKind(area, i);
          const done = i < run.stage;
          const room = run.path[i] ? ROOMS[run.path[i]] : null;
          const label =
            kind === "boss" || kind === "midBoss"
              ? creature.name
              : room
                ? `${room.icon} ${room.name}`
                : "🔀 Gabelung";
          return (
            <span
              key={i}
              className={`rounded px-1.5 py-0.5 ${
                done
                  ? "bg-xp/15 text-xp"
                  : i === run.stage
                    ? "bg-gold/20 text-gold"
                    : kind === "boss"
                      ? "bg-night-800 text-legendary"
                      : kind === "midBoss"
                        ? "bg-night-800 text-epic"
                        : "bg-night-800 text-muted"
              }`}
            >
              {done ? "✓ " : ""}
              {label}
            </span>
          );
        })}
      </div>
      {unique.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unique.map((id) => (
            <BlessingChip key={id} id={id} count={stacks(run.blessings, id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Nach einem Sieg oder Raum: Türen der nächsten Gabelung bzw. der feste nächste Kampf, dazu Aussteigen. */
export function DungeonOnward({ battle }: { battle: BattleState }) {
  const run = useGameStore((s) => s.dungeon)!;
  const next = useGameStore((s) => s.nextDungeonFight);
  const choose = useGameStore((s) => s.chooseDungeonDoor);
  const leaveWithChest = useGameStore((s) => s.leaveDungeonWithChest);
  const area = getDungeon(run.dungeonId);
  const following = area.creatures[run.stage + 1];
  const collected = chestCount(run.chest);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted">
        Du gehst mit{" "}
        <span className="num text-xp">
          {battle.hero.hp}/{battle.hero.maxHp} LP
        </span>{" "}
        weiter – keine Heilung im Dungeon.
        {collected > 0 && (
          <>
            {" "}
            🧰 In der Truhe: {collected} Beutestück{collected === 1 ? "" : "e"} – bei einer Niederlage ist sie verloren.
          </>
        )}
      </p>
      {run.doors ? (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="font-pixel text-lg text-gold">🔀 Der Gang teilt sich</p>
          <div className={`grid w-full gap-2 ${run.doors.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {run.doors.map((door, i) => (
              <DoorButton key={i} door={door} onClick={() => choose(i)} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={leaveWithChest}
          className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment"
        >
          Verlassen & Truhe öffnen
        </button>
        {!run.doors && following && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={next}
            className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-4 py-1.5 text-legendary hover:bg-legendary/25"
          >
            {following.boss ? "Zum Endboss" : "Zum Zwischenboss"}: {following.name} ▶
          </motion.button>
        )}
      </div>
    </div>
  );
}

function DoorButton({ door, onClick }: { door: Door; onClick: () => void }) {
  const room = ROOMS[door.kind];
  const danger = door.kind === "elite";
  const treasure = door.kind === "treasure";
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 text-center ${
        door.hidden
          ? "border-night-600 bg-night-800 hover:bg-night-700"
          : treasure
            ? "border-legendary bg-legendary/15 hover:bg-legendary/25"
            : danger
            ? "border-legendary/60 bg-legendary/10 hover:bg-legendary/20"
            : "border-gold/60 bg-gold/10 hover:bg-gold/20"
      }`}
    >
      <span className="text-3xl" aria-hidden>
        {door.hidden ? "❓" : room.icon}
      </span>
      <span className={`font-pixel ${door.hidden ? "text-parchment" : danger || treasure ? "text-legendary" : "text-gold"}`}>
        {door.hidden ? "Verschlossene Tür" : room.name}
      </span>
      <span className="text-xs text-muted">
        {door.hidden ? "Was dahinter liegt, siehst du erst, wenn du eintrittst." : room.description}
      </span>
    </motion.button>
  );
}

/** Ein Raum ohne Kampf: ersetzt die Kampfansicht, bis man weitergeht. */
export function DungeonRoomView({ battle, run }: { battle: BattleState; run: DungeonRun & { room: DungeonRoom } }) {
  const area = getDungeon(run.dungeonId);
  const leave = useGameStore((s) => s.leaveBattle);
  const { room } = run;
  const def = ROOMS[room.kind];
  const hpShare = battle.hero.hp / battle.hero.maxHp;

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <h2 className="font-pixel mb-3 text-2xl">
          {area.name} <span className="text-base text-muted">· {def.icon} {def.name}</span>
        </h2>
        <DungeonProgress area={area} />
        <div className="flex items-center gap-3 rounded-md bg-night-900 p-3 text-sm">
          <span className="text-muted">❤️</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-night-700">
            <motion.div
              className={`h-full ${hpShare < 0.3 ? "bg-danger" : "bg-xp"}`}
              animate={{ width: `${Math.round(hpShare * 100)}%` }}
            />
          </div>
          <span className="num text-xp">
            {battle.hero.hp}/{battle.hero.maxHp} LP
          </span>
        </div>
      </section>

      <motion.section
        key={`${run.stage}-${room.kind}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel flex flex-col items-center gap-4 p-5 text-center"
      >
        {run.claimed ? (
          <div className="flex w-full flex-col items-center gap-3">
            <p className="font-pixel text-xl text-legendary">🧰 Du verlässt {area.name} mit deiner Truhe.</p>
            <DungeonChest chest={run.claimed} />
            <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
              Zurück zur Gebietskarte
            </button>
          </div>
        ) : (
          <>
            {room.kind === "shrine" && <ShrineRoom room={room} blessings={run.blessings} />}
            {room.kind === "merchant" && <MerchantRoom room={room} />}
            {room.kind === "trap" && <TrapRoom room={room} />}
            {room.kind === "riddle" && <RiddleRoom room={room} />}
            {room.kind === "chest" && <ChestRoom room={room} />}
            {room.kind === "treasure" && <TreasureRoom room={room} />}
            {isRoomDone(room) && <DungeonOnward battle={battle} />}
          </>
        )}
      </motion.section>
    </div>
  );
}

function ShrineRoom({ room, blessings }: { room: Extract<DungeonRoom, { kind: "shrine" }>; blessings: readonly string[] }) {
  const choose = useGameStore((s) => s.dungeonBlessing);
  if (room.chosen) {
    const def = getBlessing(room.chosen);
    return (
      <p className="text-gold">
        {def.icon} <span className="font-pixel">{def.name}</span> begleitet dich bis zum Ende des Dungeons.
      </p>
    );
  }
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="text-sm text-muted">Kerzen flackern vor einer alten Statue. Du spürst, dass sie dir etwas schenken will.</p>
      <p className="font-pixel text-lg text-gold">✨ Wähle einen Segen</p>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {room.offer.map((id) => {
          const def = getBlessing(id);
          const have = blessings.filter((b) => b === id).length;
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.95 }}
              onClick={() => choose(id)}
              className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 text-center hover:bg-gold/20"
            >
              <span className="text-3xl" aria-hidden>
                {def.icon}
              </span>
              <span className="font-pixel text-gold">{def.name}</span>
              <span className="text-xs text-muted">{def.description}</span>
              {have > 0 && <span className="text-xs text-xp">Schon {have}× – stapelt sich</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function offerText(offer: MerchantOffer): { icon: string; name: string; detail: string } {
  if (offer.kind === "potion") {
    const potion = getPotion(offer.potionId);
    return { icon: potion.icon, name: potion.name, detail: potionEffectText(potion) };
  }
  if (offer.kind === "care") {
    return { icon: "🩹", name: "Wundversorgung", detail: `heilt sofort ${Math.round(offer.percent * 100)} % deiner Lebenspunkte` };
  }
  const blessing = getBlessing(offer.blessing);
  return { icon: blessing.icon, name: `Segen: ${blessing.name}`, detail: blessing.description };
}

function MerchantRoom({ room }: { room: Extract<DungeonRoom, { kind: "merchant" }> }) {
  const buy = useGameStore((s) => s.dungeonBuy);
  const gold = useGameStore((s) => s.character.gold);
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="text-sm text-muted">
        Ein Händler hat seinen Karren in eine Nische geschoben. „Hier unten zahlt man eben etwas mehr“, grinst er. Du hast{" "}
        <Gold amount={gold} className="font-bold text-gold" />.
      </p>
      <ul className="grid w-full gap-2 sm:grid-cols-2">
        {room.offers.map((offer, i) => {
          const { icon, name, detail } = offerText(offer);
          const sold = room.bought.includes(i);
          return (
            <li key={i} className="flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2 text-left">
              <span className="text-2xl" aria-hidden>
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted">{detail}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                disabled={sold || gold < offer.price}
                onClick={() => buy(i)}
                className="shrink-0 rounded-md border-2 border-gold/60 bg-gold/10 px-2 py-1 text-sm hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sold ? "Gekauft" : <Gold amount={offer.price} className="font-bold text-gold" />}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrapRoom({ room }: { room: Extract<DungeonRoom, { kind: "trap" }> }) {
  const react = useGameStore((s) => s.dungeonTrap);
  const trap = getTrap(room.trapId);
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-4xl" aria-hidden>
        {trap.icon}
      </p>
      <p className="font-pixel text-lg text-danger">{trap.name}!</p>
      <p className="max-w-md text-sm text-muted">{trap.text}</p>
      {room.outcome ? (
        <>
          <p className={room.outcome.damage > 0 ? "text-danger" : "text-xp"}>
            {room.outcome.dodged
              ? "Du bist rechtzeitig zur Seite gesprungen – kein Kratzer."
              : room.outcome.damage > 0
                ? `Die Falle erwischt dich: −${room.outcome.damage} LP.`
                : "Mit letzter Kraft kommst du durch."}
          </p>
          <p className="text-sm">Hinter der Falle findest du, was frühere Abenteurer zurückgelassen haben.</p>
          <ChestDeposit reward={room.outcome.reward} />
        </>
      ) : (
        <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => react("dodge")}
            className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20"
          >
            <span className="font-pixel text-gold">🏃 Ausweichen</span>
            <span className="text-xs text-muted">Wer flink ist, kommt ohne Kratzer davon – wer nicht, wird voll getroffen.</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => react("endure")}
            className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20"
          >
            <span className="font-pixel text-gold">🛡️ Einstecken</span>
            <span className="text-xs text-muted">Kopf runter und durch. Eine gute Rüstung fängt einiges ab.</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}

/** Truhe: Öffnen oder Weitergehen – die Knöpfe teilen sich solo und Koop. */
export function ChestChoices({ onChoose, disabled = false }: { onChoose: (choice: ChestChoice) => void; disabled?: boolean }) {
  return (
    <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={disabled}
        onClick={() => onChoose("open")}
        className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20 disabled:opacity-40"
      >
        <span className="font-pixel text-gold">🗝️ Öffnen</span>
        <span className="text-xs text-muted">Was drin ist, kommt in die Truhe – wenn es denn wirklich nur eine Truhe ist …</span>
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={disabled}
        onClick={() => onChoose("leave")}
        className="flex flex-col items-center gap-1 rounded-md border-2 border-night-600 bg-night-800 p-3 hover:bg-night-700 disabled:opacity-40"
      >
        <span className="font-pixel text-parchment">🚪 Weitergehen</span>
        <span className="text-xs text-muted">Kein Risiko, keine Beute.</span>
      </motion.button>
    </div>
  );
}

export const CHEST_INTRO =
  "Mitten im Raum steht eine alte, eisenbeschlagene Truhe. Auf dem Deckel liegt kein Staub – seltsam. Man erzählt sich von Truhen, die zubeissen.";

function ChestRoom({ room }: { room: Extract<DungeonRoom, { kind: "chest" }> }) {
  const decide = useGameStore((s) => s.dungeonChest);
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-4xl" aria-hidden>
        📦
      </p>
      <p className="max-w-md text-sm text-muted">{CHEST_INTRO}</p>
      {!room.outcome ? (
        <ChestChoices onChoose={decide} />
      ) : room.outcome.choice === "leave" ? (
        <p className="text-muted">Du lässt die Truhe stehen. Sicher ist sicher.</p>
      ) : (
        <>
          <p className="text-xp">Der Deckel knarrt – es ist nur eine Truhe. Du nimmst, was darin liegt.</p>
          <ChestDeposit reward={room.outcome.reward} />
        </>
      )}
    </div>
  );
}

function TreasureRoom({ room }: { room: Extract<DungeonRoom, { kind: "treasure" }> }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="max-w-md text-sm text-muted">
        Hinter einem lockeren Stein, genau dort, wo das Kreuz auf deiner Karte sitzt, liegt eine kleine Kammer. Staub
        rieselt von einer alten Truhe, als du den Deckel hebst.
      </p>
      <TreasureFindCard find={room.find} />
      <p className="text-xs text-xp">✓ Gehört dir schon – auch wenn du im Dungeon noch fällst. Die Karte ist eingelöst.</p>
    </div>
  );
}

function RiddleRoom({ room }: { room: Extract<DungeonRoom, { kind: "riddle" }> }) {
  const answer = useGameStore((s) => s.dungeonRiddle);
  const riddle = getRiddle(room.riddleId);
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted">Eine steinerne Fratze in der Wand öffnet die Augen und spricht:</p>
      <p className="max-w-md font-pixel text-lg text-parchment">„{riddle.text}“</p>
      {room.outcome ? (
        room.outcome.correct ? (
          <>
            <p className="text-xp">„{room.outcome.answer}“ – die Fratze lächelt. Die Wand gleitet zur Seite und gibt ein Versteck frei.</p>
            {room.outcome.reward && <ChestDeposit reward={room.outcome.reward} />}
          </>
        ) : (
          <p className="text-danger">
            „{room.outcome.answer}“ – falsch! Die Runen glühen auf und versengen dich: −{room.outcome.damage} LP.
          </p>
        )
      ) : (
        <div className="grid w-full max-w-lg gap-2 sm:grid-cols-3">
          {room.options.map((option) => (
            <motion.button
              key={option}
              whileTap={{ scale: 0.95 }}
              onClick={() => answer(option)}
              className="rounded-md border-2 border-gold/60 bg-gold/10 p-3 font-semibold text-gold hover:bg-gold/20"
            >
              {option}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
