// Wege durch die Koop-Dungeons (docs/dungeon-wege.md): Abstimmung über die Tür und die Räume
// ohne Kampf – Schrein und Falle für jeden selbst, Händler mit eigenem Gold, Rätsel per Mehrheit.

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { localDeadline, useCoopStore } from "../coop/coopStore";
import type { CoopBattleState, CoopRoom } from "../domain/coopCombat";
import { coopDoors, openRoom } from "../domain/coopDungeonPaths";
import { getRiddle, getTrap, ROOMS, type MerchantOffer } from "../domain/dungeonPaths";
import { getPotion, potionEffectText } from "../domain/potions";
import { getBlessing } from "../domain/tower";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";

/** Sekunden bis `deadline` (eigene Uhrzeit), viermal pro Sekunde aktualisiert. */
export function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Namen der Gruppe nach Spieler-Id. */
function useNames(): Record<string, string> {
  const row = useCoopStore((s) => s.row);
  return Object.fromEntries((row?.members ?? []).map((m) => [m.id, m.name]));
}

/** Wer schon entschieden hat und auf wen gewartet wird – mit der Zeit, die noch bleibt. */
function Waiting({ battle, acted, what }: { battle: CoopBattleState; acted: readonly string[]; what: string }) {
  const { row, clockOffset } = useCoopStore();
  const names = useNames();
  const seconds = useCountdown(localDeadline(battle, clockOffset));
  const present = (row?.members ?? []).filter((m) => !m.left);
  const waiting = present.filter((m) => !acted.includes(m.id));
  if (waiting.length === 0) return null;
  return (
    <p className="text-center text-xs text-muted">
      ⏳ Warten auf {waiting.map((m) => names[m.id]).join(", ")} – noch <span className="num">{seconds}</span> s, dann {what}.
    </p>
  );
}

/** Raum ohne Kampf, in dem die Gruppe steht – oder null. */
export function CoopRoomPanel({ battle }: { battle: CoopBattleState }) {
  // Der Name des Raums steht schon in der Überschrift des Zwischenbildschirms
  const room = battle.dungeon?.room;
  if (!room) return null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-md bg-night-800 p-4 text-center">
      {room.kind === "shrine" && <Shrine battle={battle} room={room} />}
      {room.kind === "merchant" && <Merchant room={room} />}
      {room.kind === "trap" && <Trap battle={battle} room={room} />}
      {room.kind === "riddle" && <Riddle battle={battle} room={room} />}
    </div>
  );
}

function Shrine({ battle, room }: { battle: CoopBattleState; room: Extract<CoopRoom, { kind: "shrine" }> }) {
  const { myId, busy } = useCoopStore();
  const send = useCoopStore((s) => s.dungeonCommand);
  const names = useNames();
  const mine = room.chosen[myId];
  return (
    <>
      <p className="text-sm text-muted">Kerzen flackern vor einer alten Statue. Jeder von euch darf sich einen Segen nehmen.</p>
      {mine ? (
        <p className="text-gold">
          {getBlessing(mine).icon} <span className="font-pixel">{getBlessing(mine).name}</span> begleitet dich bis zum Ende des Dungeons.
        </p>
      ) : (
        <div className="grid w-full gap-2 sm:grid-cols-3">
          {(room.offers[myId] ?? []).map((id) => {
            const def = getBlessing(id);
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.95 }}
                disabled={busy || room.done}
                onClick={() => send({ type: "blessing", blessing: id })}
                className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20 disabled:opacity-40"
              >
                <span className="text-3xl" aria-hidden>
                  {def.icon}
                </span>
                <span className="font-pixel text-gold">{def.name}</span>
                <span className="text-xs text-muted">{def.description}</span>
              </motion.button>
            );
          })}
        </div>
      )}
      {Object.entries(room.chosen)
        .filter(([id]) => id !== myId)
        .map(([id, blessing]) => (
          <p key={id} className="text-xs text-muted">
            {names[id]} wählt {getBlessing(blessing).icon} {getBlessing(blessing).name}.
          </p>
        ))}
      {!room.done && <Waiting battle={battle} acted={Object.keys(room.chosen)} what="bekommt jeder den ersten Segen" />}
    </>
  );
}

function offerText(offer: MerchantOffer): { icon: string; name: string; detail: string } {
  if (offer.kind === "potion") {
    const potion = getPotion(offer.potionId);
    return { icon: potion.icon, name: potion.name, detail: potionEffectText(potion) };
  }
  if (offer.kind === "care") return { icon: "🩹", name: "Wundversorgung", detail: `heilt sofort ${Math.round(offer.percent * 100)} % deiner Lebenspunkte` };
  const blessing = getBlessing(offer.blessing);
  return { icon: blessing.icon, name: `Segen: ${blessing.name}`, detail: blessing.description };
}

function Merchant({ room }: { room: Extract<CoopRoom, { kind: "merchant" }> }) {
  const { myId, busy } = useCoopStore();
  const send = useCoopStore((s) => s.dungeonCommand);
  const gold = useGameStore((s) => s.character.gold);
  return (
    <>
      <p className="text-sm text-muted">
        Ein Händler hat seinen Karren in eine Nische geschoben – jeder kauft für sich. Du hast <Gold amount={gold} className="font-bold text-gold" />.
      </p>
      <ul className="grid w-full gap-2 sm:grid-cols-2">
        {(room.offers[myId] ?? []).map((offer, i) => {
          const { icon, name, detail } = offerText(offer);
          const sold = room.bought[myId]?.includes(i);
          return (
            <li key={i} className="flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-900 p-2 text-left">
              <span className="text-2xl" aria-hidden>
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted">{detail}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                disabled={busy || sold || gold < offer.price}
                onClick={() => send({ type: "buy", index: i })}
                className="shrink-0 rounded-md border-2 border-gold/60 bg-gold/10 px-2 py-1 text-sm hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sold ? "Gekauft" : <Gold amount={offer.price} className="font-bold text-gold" />}
              </motion.button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Einkaufen geht, solange ihr über die nächste Tür abstimmt.</p>
    </>
  );
}

function Trap({ battle, room }: { battle: CoopBattleState; room: Extract<CoopRoom, { kind: "trap" }> }) {
  const { myId, busy } = useCoopStore();
  const send = useCoopStore((s) => s.dungeonCommand);
  const names = useNames();
  const trap = getTrap(room.trapId);
  const mine = room.outcomes[myId];
  return (
    <>
      <p className="font-pixel text-lg text-danger">
        {trap.icon} {trap.name}!
      </p>
      <p className="max-w-md text-sm text-muted">{trap.text}</p>
      {mine ? null : (
        <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={busy || room.done}
            onClick={() => send({ type: "trap", choice: "dodge" })}
            className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20 disabled:opacity-40"
          >
            <span className="font-pixel text-gold">🏃 Ausweichen</span>
            <span className="text-xs text-muted">Wer flink ist, kommt ohne Kratzer davon – wer nicht, wird voll getroffen.</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={busy || room.done}
            onClick={() => send({ type: "trap", choice: "endure" })}
            className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 hover:bg-gold/20 disabled:opacity-40"
          >
            <span className="font-pixel text-gold">🛡️ Einstecken</span>
            <span className="text-xs text-muted">Kopf runter und durch. Eine gute Rüstung fängt einiges ab.</span>
          </motion.button>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-sm">
        {Object.entries(room.outcomes).map(([id, o]) => (
          <li key={id} className={o.damage > 0 ? "text-danger" : "text-xp"}>
            {names[id]}: {o.dodged ? "weicht aus – kein Kratzer" : o.damage > 0 ? `−${o.damage} LP` : "kommt mit letzter Kraft durch"}
          </li>
        ))}
      </ul>
      {room.done ? (
        <p className="text-sm">Hinter der Falle findet jeder, was frühere Abenteurer zurückgelassen haben – es liegt in eurer Truhe.</p>
      ) : (
        <Waiting battle={battle} acted={Object.keys(room.outcomes)} what="stecken die übrigen ein" />
      )}
    </>
  );
}

function Riddle({ battle, room }: { battle: CoopBattleState; room: Extract<CoopRoom, { kind: "riddle" }> }) {
  const { myId, busy } = useCoopStore();
  const send = useCoopStore((s) => s.dungeonCommand);
  const names = useNames();
  const riddle = getRiddle(room.riddleId);
  const votesFor = (option: string) => Object.entries(room.votes).filter(([, v]) => v === option).map(([id]) => names[id]);
  return (
    <>
      <p className="text-sm text-muted">Eine steinerne Fratze in der Wand öffnet die Augen und spricht:</p>
      <p className="max-w-md font-pixel text-lg text-parchment">„{riddle.text}“</p>
      {room.outcome ? (
        <p className={room.outcome.correct ? "text-xp" : "text-danger"}>
          „{room.outcome.answer}“ –{" "}
          {room.outcome.correct
            ? "die Fratze lächelt. Ein Versteck öffnet sich – die Beute liegt in eurer Truhe."
            : `falsch! Die Runen glühen auf und versengen euch: −${room.outcome.damage} LP.`}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">Die Mehrheit entscheidet, bei Gleichstand zählt der Host.</p>
          <div className="grid w-full max-w-lg gap-2 sm:grid-cols-3">
            {room.options.map((option) => (
              <motion.button
                key={option}
                whileTap={{ scale: 0.95 }}
                disabled={busy}
                onClick={() => send({ type: "riddle", answer: option })}
                className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 font-semibold ${
                  room.votes[myId] === option ? "border-gold bg-gold/25 text-gold" : "border-gold/50 bg-gold/10 text-gold hover:bg-gold/20"
                }`}
              >
                {option}
                {votesFor(option).length > 0 && <span className="text-xs font-normal text-muted">{votesFor(option).join(", ")}</span>}
              </motion.button>
            ))}
          </div>
          <Waiting battle={battle} acted={Object.keys(room.votes)} what="zählen die abgegebenen Stimmen" />
        </>
      )}
    </>
  );
}

/** Gabelung: alle stimmen ab, bei Gleichstand zählt der Host. Null, wenn keine Tür zur Wahl steht. */
export function CoopDoorVote({ battle }: { battle: CoopBattleState }) {
  const { myId, busy } = useCoopStore();
  const send = useCoopStore((s) => s.dungeonCommand);
  const names = useNames();
  const doors = coopDoors(battle);
  if (!doors || openRoom(battle)) return null;
  const votes = battle.dungeon?.votes ?? {};
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="font-pixel text-lg text-gold">🔀 Der Gang teilt sich – stimmt ab</p>
      <div className={`grid w-full gap-2 ${doors.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {doors.map((door, i) => {
          const room = ROOMS[door.kind];
          const voters = Object.entries(votes).filter(([, v]) => v === i).map(([id]) => names[id]);
          const mine = votes[myId] === i;
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.95 }}
              disabled={busy}
              onClick={() => send({ type: "door", index: i })}
              className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 text-center ${
                mine
                  ? "border-gold bg-gold/25"
                  : door.hidden
                    ? "border-night-600 bg-night-800 hover:bg-night-700"
                    : door.kind === "elite"
                      ? "border-legendary/60 bg-legendary/10 hover:bg-legendary/20"
                      : "border-gold/60 bg-gold/10 hover:bg-gold/20"
              }`}
            >
              <span className="text-3xl" aria-hidden>
                {door.hidden ? "❓" : room.icon}
              </span>
              <span className={`font-pixel ${door.hidden ? "text-parchment" : door.kind === "elite" ? "text-legendary" : "text-gold"}`}>
                {door.hidden ? "Verschlossene Tür" : room.name}
              </span>
              <span className="text-xs text-muted">{door.hidden ? "Was dahinter liegt, seht ihr erst drinnen." : room.description}</span>
              {voters.length > 0 && <span className="text-xs text-xp">🗳️ {voters.join(", ")}</span>}
            </motion.button>
          );
        })}
      </div>
      <Waiting battle={battle} acted={Object.keys(votes)} what="zählen die abgegebenen Stimmen" />
    </div>
  );
}
