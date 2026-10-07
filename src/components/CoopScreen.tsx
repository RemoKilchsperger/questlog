import { motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useCloudStore } from "../cloud/cloudStore";
import { availableBackend } from "../coop/backend";
import { coopReadyBlocker, localDeadline, useCoopStore } from "../coop/coopStore";
import { isLobbyCode } from "../coop/protocol";
import { getAbility } from "../domain/abilities";
import {
  clearedStages,
  COOP_BOSSES,
  COOP_COST,
  COOP_MAX_PLAYERS,
  COOP_MIN_PLAYERS,
  COOP_REWARD_FACTOR,
  coopBossCreature,
  coopAbilityBlocker,
  coopAbilityDue,
  coopContent,
  coopCost,
  coopPotionBlocker,
  dungeonCompleted,
  DUNGEON_REVIVE_HP,
  getCoopEnemy,
  hasNextStage,
  isCoopDungeon,
  nextStageEnemy,
  rollCoopDungeonChest,
  type CoopAction,
  type CoopBattleState,
  type CoopEvent,
} from "../domain/coopCombat";
import { dungeonDecider } from "../coop/server";
import { DUNGEONS, getDungeon } from "../domain/creatures";
import { getItemStats } from "../domain/items";
import { Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { getPotion, POTIONS, potionHeal } from "../domain/potions";
import { EventBus } from "../game/EventBus";
import { useGameStore } from "../store/gameStore";
import { BossDrops } from "./BattleScreen";
import { ConfirmDialog } from "./ConfirmDialog";
import { DungeonChest } from "./DungeonChest";
import { PixelAvatar } from "./PixelAvatar";
import { CreatureSprite } from "./CreatureSprite";
import { POTION_BUTTONS } from "./potionUi";
import { AbilityButton, ActionGroup, enemyStatusChips, heroStatusChips, StatusSide } from "./BattleStatus";
import { classAbility } from "../domain/heroClasses";

// Phaser ist gross – erst laden, wenn tatsächlich gekämpft wird.
const PhaserCoopBattle = lazy(() => import("../game/PhaserCoopBattle"));

/** Einladungslink zu einer Lobby. */
export const coopLink = (code: string) => `${window.location.origin}${window.location.pathname}#/koop/${code}`;

/* ───────────────────────── Auswahl im Kampf-Tab ───────────────────────── */

/** Einladungscode eingeben und einer Lobby beitreten – im Kampf-Tab links unter den Tränken. */
export function CoopJoinForm() {
  const loggedIn = useCloudStore((s) => s.session !== null);
  const joinLobby = useCoopStore((s) => s.joinLobby);
  const busy = useCoopStore((s) => s.busy);
  const joinError = useCoopStore((s) => s.joinError);
  const clearError = useCoopStore((s) => s.clearError);
  const [code, setCode] = useState("");
  const cleanCode = code.trim().toUpperCase();
  const errorLine = joinError && <p className="mt-1 text-xs text-danger">{joinError}</p>;
  // Ohne Koop kein Eingabefeld – eine Meldung (z. B. Einladungslink ohne Anmeldung) aber schon
  if (!availableBackend(loggedIn)) return errorLine ? <div className="w-full border-t border-night-700 pt-3 text-left">{errorLine}</div> : null;

  return (
    <form
      className="w-full border-t border-night-700 pt-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (isLobbyCode(cleanCode)) joinLobby(cleanCode);
      }}
    >
      <label htmlFor="coop-code" className="mb-1 block text-xs uppercase tracking-wide text-muted">
        🤝 Koop-Einladung
      </label>
      <div className="flex gap-2">
        <input
          id="coop-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (joinError) clearError();
          }}
          placeholder="Code"
          maxLength={6}
          className="num min-w-0 flex-1 rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 uppercase tracking-widest outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={!isLobbyCode(cleanCode) || busy}
          className="rounded-md border-2 border-gold/70 px-3 py-1 text-sm text-gold hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Beitreten
        </button>
      </div>
      {errorLine}
    </form>
  );
}

/** Koop-Bosse in der Gebietsauswahl: Lobby erstellen (beitreten geht mit `CoopJoinForm`). */
export function CoopPanel({ heroLevel }: { heroLevel: number }) {
  const loggedIn = useCloudStore((s) => s.session !== null);
  const createLobby = useCoopStore((s) => s.createLobby);
  const joinLobby = useCoopStore((s) => s.joinLobby);
  const error = useCoopStore((s) => s.error);
  const busy = useCoopStore((s) => s.busy);
  const rejoin = useCoopStore((s) => s.rejoin);
  const checkRejoin = useCoopStore((s) => s.checkRejoin);
  const battlePoints = useGameStore((s) => s.character.battlePoints);
  const kind = availableBackend(loggedIn);
  // Läuft noch ein Koop-Kampf (z. B. nach dem Neuladen)? Dann zurückkehren anbieten.
  useEffect(() => void checkRejoin(), [checkRejoin, loggedIn]);

  return (
    <section className="panel p-5">
      <h2 className="font-pixel text-2xl">Koop-Bosse</h2>
      <p className="mb-3 text-sm text-muted">
        {COOP_MIN_PLAYERS}–{COOP_MAX_PLAYERS} Helden gegen einen gemeinsamen Boss: Jede Runde wählen alle gleichzeitig,
        danach schlägt der Boss zurück – meist den, der ihm am meisten zusetzt. Gefallene lassen sich mit einem Heiltrank
        wiederbeleben. Jeder bezahlt {COOP_COST} Kampfpunkte und würfelt seine eigene Beute (×{COOP_REWARD_FACTOR} XP und
        Gold).
      </p>
      {!kind ? (
        <p className="rounded-md bg-night-800 p-3 text-sm text-muted">
          ☁️ Für Koop-Kämpfe musst du mit deinem Cloud-Konto angemeldet sein (oben rechts).
        </p>
      ) : (
        <>
          {kind === "local" && (
            <p className="mb-3 rounded-md bg-night-800 p-2 text-xs text-muted">
              🧪 Testmodus: Ohne Anmeldung verbinden sich nur Tabs in diesem Browser.
            </p>
          )}
          {rejoin && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border-2 border-gold/60 bg-gold/10 p-3">
              <span className="flex-1 text-sm">
                ⚔️ {rejoin.phase === "lobby" ? "Deine Lobby" : "Dein Kampf"}{" "}
                {isCoopDungeon(rejoin.boss_id) ? "im Dungeon" : "gegen"} <b>{coopContent(rejoin.boss_id).name}</b> läuft noch.
              </span>
              <motion.button
                whileTap={{ scale: 0.92 }}
                disabled={busy}
                onClick={() => joinLobby(rejoin.code)}
                className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25 disabled:opacity-40"
              >
                Zurückkehren
              </motion.button>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {COOP_BOSSES.map((boss) => {
              const tooLow = heroLevel < boss.level;
              const poor = battlePoints < COOP_COST;
              return (
                <li key={boss.id} className="flex flex-wrap items-center gap-3 rounded-md border-2 border-legendary/40 bg-night-800 p-3">
                  <CreatureSprite sprite={boss.sprite} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-legendary">
                      {boss.name} <span className="text-xs text-muted">Lv. {boss.level}</span>
                    </p>
                    <p className="text-xs text-muted">{boss.description}</p>
                    <p className="text-xs text-danger">
                      {boss.ability.icon} {boss.ability.name}: {boss.ability.description}
                    </p>
                    <BossDrops creature={coopBossCreature(boss)} />
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    disabled={tooLow || poor || busy}
                    onClick={() => createLobby(boss.id)}
                    title={tooLow ? `Ab Level ${boss.level}` : poor ? `Du brauchst ${COOP_COST} Kampfpunkte` : undefined}
                    className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-3 py-1.5 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Lobby erstellen <span className="num text-xs">−{COOP_COST} ⚔️</span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

/** Dungeons im Koop – im Dungeon-Bereich des Kampf-Tabs, wenn dort „Koop“ gewählt ist. */
export function CoopDungeonList({ heroLevel }: { heroLevel: number }) {
  const loggedIn = useCloudStore((s) => s.session !== null);
  const createLobby = useCoopStore((s) => s.createLobby);
  const error = useCoopStore((s) => s.error);
  const busy = useCoopStore((s) => s.busy);
  const battlePoints = useGameStore((s) => s.character.battlePoints);
  const kind = availableBackend(loggedIn);

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Zu zweit bis zu viert: Die Gegner sind stärker, je grösser die Gruppe. Zwischen den Kämpfen keine Heilung,
        Gefallene stehen mit {Math.round(DUNGEON_REVIVE_HP * 100)} % LP wieder auf. Nach jedem Sieg entscheidet der Host:
        weiter oder mit der Truhe aussteigen. Jeder hat seine eigene Truhe – fällt die Gruppe, ist sie weg. Lobby erstellen,
        Link teilen – Mitspieler treten über den Link oder mit dem Code links unter den Tränken bei.
      </p>
      {!kind ? (
        <p className="rounded-md bg-night-800 p-3 text-sm text-muted">
          ☁️ Für Koop-Dungeons musst du mit deinem Cloud-Konto angemeldet sein (oben rechts).
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {DUNGEONS.map((dungeon) => {
            const cost = coopCost(dungeon.id);
            const tooLow = heroLevel < dungeon.minLevel;
            const poor = battlePoints < cost;
            const boss = dungeon.creatures[dungeon.creatures.length - 1];
            return (
              <li
                key={dungeon.id}
                className={`flex flex-wrap items-center gap-3 rounded-md border-2 bg-night-800 p-3 ${
                  tooLow ? "border-night-700 opacity-60" : "border-legendary/60"
                }`}
              >
                <CreatureSprite sprite={boss.sprite} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="font-pixel text-lg">
                    {tooLow ? "🔒" : "🏰"} {dungeon.name}{" "}
                    <span className="font-sans text-xs text-muted">ab Lv. {dungeon.minLevel}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {dungeon.description} {dungeon.creatures.length} Kämpfe, Endboss: {boss.name}.
                  </p>
                  <BossDrops creature={boss} />
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  disabled={tooLow || poor || busy}
                  onClick={() => createLobby(dungeon.id)}
                  title={tooLow ? `Ab Level ${dungeon.minLevel}` : poor ? `Du brauchst ${cost} Kampfpunkte` : undefined}
                  className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-3 py-1.5 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Lobby erstellen <span className="num text-xs">−{cost} ⚔️</span>
                </motion.button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </>
  );
}

/* ───────────────────────── Lobby und Kampf ───────────────────────── */

export function CoopScreen() {
  const phase = useCoopStore((s) => s.phase);
  const leave = useCoopStore((s) => s.leave);
  const battleId = useCoopStore((s) => s.row?.state?.id);

  if (phase === "joining") {
    return (
      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-pixel text-xl">Verbinde mit der Lobby …</p>
        <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
          Abbrechen
        </button>
      </section>
    );
  }
  // Jeder Kampf (im Dungeon: jeder Gegner) bekommt eine frische Ansicht samt Szene.
  return phase === "lobby" ? <Lobby /> : <CoopBattle key={battleId} />;
}

function Lobby() {
  const { row, myId, error, busy } = useCoopStore();
  const setReady = useCoopStore((s) => s.setReady);
  const start = useCoopStore((s) => s.startBattle);
  const leave = useCoopStore((s) => s.leave);
  const [copied, setCopied] = useState(false);
  if (!row) return null;
  const { code, host_id: hostId, members } = row;
  const content = coopContent(row.boss_id);
  const raid = isCoopDungeon(row.boss_id) ? null : getCoopEnemy(row.boss_id).abilities[0];
  const cost = coopCost(row.boss_id);
  const isHost = hostId === myId;
  const me = members.find((m) => m.id === myId);
  const others = members.filter((m) => m.id !== hostId);
  const readyBlocker = coopReadyBlocker();
  const startBlocker =
    members.length < COOP_MIN_PLAYERS
      ? `Warte auf Mitspieler (mindestens ${COOP_MIN_PLAYERS}).`
      : others.some((m) => !m.ready)
        ? "Noch nicht alle sind bereit."
        : readyBlocker;

  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-wrap items-center gap-4 p-5">
        <CreatureSprite sprite={content.sprite} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="font-pixel text-2xl">
            Koop-Lobby · <span className="text-legendary">{content.name}</span>
          </h2>
          <p className="text-sm text-muted">
            {raid ? `${raid.icon} ${raid.name}: ${raid.description}` : `${content.description} ${getDungeon(row.boss_id).creatures.length} Kämpfe hintereinander.`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted">Einladungscode</p>
          <p className="num text-3xl tracking-[0.3em] text-gold">{code}</p>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(coopLink(code)).then(() => setCopied(true));
              window.setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-1 rounded-md border-2 border-gold/60 px-2 py-0.5 text-xs text-gold hover:bg-gold/15"
          >
            {copied ? "✓ Link kopiert" : "🔗 Link kopieren"}
          </button>
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="font-pixel mb-3 text-xl">
          Gruppe <span className="num text-sm text-muted">{members.length}/{COOP_MAX_PLAYERS}</span>
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <li key={m.id} className={`flex items-center gap-3 rounded-md border-2 bg-night-800 p-2 ${m.id === myId ? "border-gold/60" : "border-night-700"}`}>
              <PixelAvatar size={48} equipment={m.equipment} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.id === hostId && <span title="Host">👑 </span>}
                  {m.name}
                  {m.username && <span className="ml-1 text-xs text-muted">@{m.username}</span>}
                </p>
                <p className="text-xs text-muted">
                  Lv. {m.level} · {m.profile.maxHp} LP · {Math.round(m.profile.damage)} Schaden · {Math.round(m.profile.armor)} Rüstung
                </p>
              </div>
              <span className={`text-sm ${m.id === hostId || m.ready ? "text-xp" : "text-muted"}`}>
                {m.id === hostId ? "Host" : m.ready ? "✓ bereit" : "…"}
              </span>
            </li>
          ))}
          {Array.from({ length: COOP_MAX_PLAYERS - members.length }, (_, i) => (
            <li key={`free-${i}`} className="flex items-center justify-center rounded-md border-2 border-dashed border-night-700 p-4 text-sm text-muted">
              Freier Platz
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Beim Start bezahlt jeder {cost} Kampfpunkte. Pro Runde hast du 30 Sekunden – wer nicht wählt, greift normal an.
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
            Verlassen
          </button>
          {isHost ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={startBlocker !== null || busy}
              onClick={start}
              title={startBlocker ?? undefined}
              className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-5 py-1.5 text-lg text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⚔️ Kampf starten
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={(!me?.ready && readyBlocker !== null) || busy}
              onClick={() => setReady(!me?.ready)}
              title={!me?.ready ? (readyBlocker ?? undefined) : undefined}
              className={`font-pixel rounded-md border-2 px-5 py-1.5 text-lg disabled:cursor-not-allowed disabled:opacity-40 ${
                me?.ready ? "border-night-600 text-muted" : "border-xp bg-xp/15 text-xp hover:bg-xp/25"
              }`}
            >
              {me?.ready ? "Doch nicht bereit" : "✓ Bereit"}
            </motion.button>
          )}
          {startBlocker && isHost && <span className="self-center text-xs text-muted">{startBlocker}</span>}
        </div>
      </section>
    </div>
  );
}

/** Sekunden bis `deadline`, jede Sekunde neu berechnet. */
function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function CoopBattle() {
  const { row, myId } = useCoopStore();
  const leave = useCoopStore((s) => s.leave);
  const battle = row?.state ?? null;
  const members = row?.members ?? [];
  const chosen = Object.keys(row?.actions ?? {});
  const away = members.filter((m) => m.left).map((m) => m.id);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const cancelLeave = useCallback(() => setConfirmLeave(false), []);
  // Während die Szene animiert, sind die Aktionen gesperrt (wie im Solo-Kampf). Gemessen an
  // der Länge des Protokolls – die Rundennummer bleibt in der letzten Runde gleich.
  const [animated, setAnimated] = useState(battle?.log.length ?? 0);
  useEffect(() => EventBus.on("coop:animation-done", ({ logLength }) => setAnimated(logLength)), []);
  // Sicherheitsnetz, falls die Szene (z. B. im Hintergrund-Tab) nicht antwortet
  const logLength = battle?.log.length ?? 0;
  useEffect(() => {
    const t = window.setTimeout(() => setAnimated((n) => Math.max(n, logLength)), 8000);
    return () => window.clearTimeout(t);
  }, [logLength]);
  if (!battle || !row) return null;
  const boss = getCoopEnemy(battle.bossId);
  const animating = animated < battle.log.length;
  const finished = battle.status !== "active";
  const dungeon = battle.dungeon ? getDungeon(battle.dungeon.id) : null;
  const due = coopAbilityDue(battle);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-pixel text-2xl">
            Koop · {dungeon && <span className="text-muted">{dungeon.name} · </span>}
            <span className="text-legendary">{boss.name}</span>
            {dungeon && (
              <span className="num ml-2 text-sm text-muted">
                Kampf {battle.dungeon!.stage + 1}/{dungeon.creatures.length}
              </span>
            )}
          </h2>
          <span className="font-pixel text-gold">
            Runde <span className="num">{battle.round}</span>
          </span>
        </div>
        <Suspense
          fallback={
            <div className="flex aspect-[9/4] w-full items-center justify-center rounded-md bg-night-950 text-muted">
              Kampfszene wird geladen …
            </div>
          }
        >
          <PhaserCoopBattle battleId={battle.id} />
        </Suspense>
      </section>

      {finished && !animating ? (
        row.phase === "battle" && hasNextStage(battle) ? (
          <DungeonIntermission battle={battle} />
        ) : (
          <CoopResultPanel battle={battle} onLeave={leave} />
        )
      ) : (
        <section className="panel flex flex-col gap-3 p-4">
          <TeamStatus battle={battle} chosen={chosen} away={away} myId={myId} names={Object.fromEntries(members.map((m) => [m.id, m.name]))} />
          {due && !finished && (
            <p className="rounded-md bg-danger/15 px-3 py-1.5 text-sm text-danger">
              ⚠️ {due.icon} {boss.name} setzt diese Runde <b>{due.name}</b> ein{due.aoe && <b> – trifft alle</b>}: {due.description}
            </p>
          )}
          <ActionBar battle={battle} locked={animating || finished} />
          <div className="flex justify-end">
            <button
              onClick={() => setConfirmLeave(true)}
              className="rounded-md border-2 border-night-600 px-3 py-1 text-xs text-muted hover:text-parchment"
            >
              Kampf verlassen
            </button>
          </div>
          <ConfirmDialog
            open={confirmLeave}
            title="Kampf verlassen?"
            confirmLabel="Verlassen"
            onCancel={cancelLeave}
            onConfirm={() => {
              setConfirmLeave(false);
              leave();
            }}
          >
            <p>
              Die anderen kämpfen weiter, dein Held greift automatisch an. Du kannst jederzeit über den Kampf-Tab
              zurückkehren – Beute gibt es nur, wenn du beim Sieg dabei bist.
            </p>
          </ConfirmDialog>
        </section>
      )}

      <CoopLog battle={battle} names={Object.fromEntries(members.map((m) => [m.id, m.name]))} />
    </div>
  );
}

function TeamStatus({
  battle,
  chosen,
  away,
  myId,
  names,
}: {
  battle: CoopBattleState;
  chosen: string[];
  /** Spieler, die den Kampf verlassen haben */
  away: string[];
  myId: string;
  names: Record<string, string>;
}) {
  const clockOffset = useCoopStore((s) => s.clockOffset);
  const seconds = useCountdown(localDeadline(battle, clockOffset));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={`num rounded-md px-2 py-0.5 ${seconds <= 5 ? "bg-danger/20 text-danger" : "bg-night-800 text-gold"}`}>⏱ {seconds}s</span>
      {battle.heroes.map((h) => {
        const status = h.down ? "💀" : h.effects.frozen ? "❄️" : away.includes(h.id) ? "🚪" : chosen.includes(h.id) ? "✓" : "⏳";
        return (
          <span
            key={h.id}
            className={`rounded-md px-2 py-0.5 ${h.id === myId ? "bg-gold/15 text-gold" : "bg-night-800"} ${h.down ? "opacity-60" : ""}`}
            title={h.down ? "Gefallen" : away.includes(h.id) ? "Hat den Kampf verlassen – greift automatisch an" : chosen.includes(h.id) ? "Hat gewählt" : "Wählt noch"}
          >
            {status} {names[h.id] ?? h.name}
            <span className="num ml-1 text-xs text-muted">
              {h.combatant.hp}/{h.combatant.maxHp}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ActionBar({ battle, locked }: { battle: CoopBattleState; locked: boolean }) {
  const { myId, pendingAction, row } = useCoopStore();
  const myAction = pendingAction ?? row?.actions[myId] ?? null;
  const choose = useCoopStore((s) => s.chooseAction);
  const stock = useGameStore((s) => s.potions);
  const [potion, setPotion] = useState<CoopAction["potion"]>(undefined);
  // Neue Runde: Trank-Auswahl zurücksetzen
  useEffect(() => setPotion(undefined), [battle.round]);
  const me = battle.heroes.find((h) => h.id === myId);
  if (!me) return <p className="text-sm text-muted">Du schaust zu.</p>;
  if (me.down) {
    return (
      <p className="rounded-md bg-night-800 p-3 text-sm text-muted">
        💀 Du bist gefallen{me.revived ? "" : " – ein Mitspieler kann dich mit einem Heiltrank wiederbeleben"}.
      </p>
    );
  }
  if (me.effects.frozen) {
    return (
      <p className="rounded-md bg-intellect/15 p-3 text-sm text-intellect">
        ❄️ Du bist eingefroren und setzt diese Runde aus. Danach taust du wieder auf.
      </p>
    );
  }
  if (myAction) {
    const what = myAction.ability ? getAbility(myAction.ability).name : "Angriff";
    return (
      <p className="rounded-md bg-night-800 p-3 text-sm">
        ✓ Gewählt: <b>{what}</b>
        {myAction.potion && ` + ${getPotion(myAction.potion.potionId).name}`} – warte auf die anderen …
      </p>
    );
  }
  const send = (ability?: CoopAction["ability"]) => choose({ ...(potion && { potion }), ...(ability && { ability }) });
  const fallen = battle.heroes.filter((h) => h.down && !h.revived);

  return (
    <div className="flex flex-col gap-4">
      {/* Zustand: links du, rechts der Boss */}
      <div className="grid gap-2 sm:grid-cols-2">
        <StatusSide title="Du" chips={heroStatusChips(me.buffs, me.effects)}>
          <div className="flex flex-wrap gap-x-3 text-sm">
            <span className="text-xp">
              ❤️ <span className="num">{me.combatant.hp}/{me.combatant.maxHp}</span>
            </span>
            <span className="text-intellect">
              💧 <span className="num">{me.mana}/{me.maxMana}</span>
            </span>
          </div>
        </StatusSide>
        <StatusSide title={battle.boss.name} chips={enemyStatusChips(battle.bossEffects)} />
      </div>

      <ActionGroup label="Angriff" hint="Alle Helden handeln, danach der Boss.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={locked}
            onClick={() => send()}
            className="font-pixel rounded-md border-2 border-danger bg-danger/20 px-4 py-2 text-xl text-danger hover:bg-danger/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⚔️ Angreifen
          </motion.button>
          {me.abilities.map((id) => (
            <AbilityButton
              key={id}
              ability={classAbility(id, me.heroClass)}
              blocker={coopAbilityBlocker(me, id)}
              disabled={locked}
              onClick={() => send(id)}
            />
          ))}
        </div>
      </ActionGroup>

      <ActionGroup label="Trank dazu" hint="Wird vor deinem Angriff getrunken – erst wählen, dann angreifen.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {POTIONS.map((p) => {
            const count = stock[p.id] ?? 0;
            const blocker = count === 0 ? "Keine mehr im Vorrat." : coopPotionBlocker(battle, myId, p.id, myId);
            const selected = potion?.potionId === p.id && potion.targetId === myId;
            const effect = p.effect.kind === "heal" ? `Heilt ${potionHeal(p, me.combatant.maxHp)} LP` : p.name;
            return (
              <button
                key={p.id}
                disabled={locked || blocker !== null}
                onClick={() => setPotion(selected ? undefined : { potionId: p.id, targetId: myId })}
                aria-pressed={selected}
                title={blocker ? `${effect}\n${blocker}` : effect}
                className={`rounded-md border-2 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${POTION_BUTTONS[p.effect.kind]} ${selected ? "ring-2 ring-gold" : ""}`}
              >
                {p.icon} <span className="hidden text-xs sm:inline">{p.name}</span> <span className="num font-bold">× {count}</span>
              </button>
            );
          })}
        </div>
      </ActionGroup>
      {fallen.length > 0 && (
        <ActionGroup label="Wiederbeleben" hint="Ein Heiltrank holt einen gefallenen Mitspieler zurück.">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {fallen.flatMap((target) =>
              POTIONS.filter((p) => p.effect.kind === "heal").map((p) => {
                const count = stock[p.id] ?? 0;
                const blocker = count === 0 ? "Keine mehr im Vorrat." : coopPotionBlocker(battle, myId, p.id, target.id);
                const selected = potion?.potionId === p.id && potion.targetId === target.id;
                return (
                  <button
                    key={`${target.id}-${p.id}`}
                    disabled={locked || blocker !== null}
                    onClick={() => setPotion(selected ? undefined : { potionId: p.id, targetId: target.id })}
                    aria-pressed={selected}
                    title={blocker ?? `${target.name} steht mit ${potionHeal(p, target.combatant.maxHp)} LP wieder auf`}
                    className={`rounded-md border-2 border-xp/60 px-2 py-1 text-xp disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "ring-2 ring-gold" : ""}`}
                  >
                    {p.icon} → {target.name}
                  </button>
                );
              }),
            )}
          </div>
        </ActionGroup>
      )}
      {potion && (
        <p className="text-xs text-gold">
          {getPotion(potion.potionId).name} {potion.targetId === myId ? "für dich" : "zum Wiederbeleben"} gewählt – jetzt angreifen.
        </p>
      )}
    </div>
  );
}

/** Zwischen zwei Dungeon-Kämpfen: Zustand der Gruppe, eigene Truhe, nächster Gegner – der Host entscheidet. */
function DungeonIntermission({ battle }: { battle: CoopBattleState }) {
  const { row, myId, busy, error } = useCoopStore();
  const continueDungeon = useCoopStore((s) => s.continueDungeon);
  const exitDungeon = useCoopStore((s) => s.exitDungeon);
  if (!row) return null;
  const next = nextStageEnemy(battle)!;
  const total = getDungeon(battle.dungeon!.id).creatures.length;
  const decider = dungeonDecider(row);
  const deciderName = row.members.find((m) => m.id === decider)?.name ?? "Host";
  const me = row.members.find((m) => m.id === myId);
  const chest = me ? rollCoopDungeonChest(battle, me.profile, myId) : null;

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel flex flex-col gap-4 border-gold p-5">
      <div className="text-center">
        <h2 className="font-pixel text-3xl text-gold">Sieg über {getCoopEnemy(battle.bossId).name}!</h2>
        <p className="text-sm text-muted">
          Kampf {clearedStages(battle)} von {total} geschafft. Keine Heilung bis zum nächsten Kampf – Gefallene stehen mit{" "}
          {Math.round(DUNGEON_REVIVE_HP * 100)} % LP wieder auf.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-night-800 p-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Gruppe</p>
          <ul className="flex flex-col gap-1 text-sm">
            {battle.heroes.map((h) => (
              <li key={h.id} className={`flex justify-between gap-2 ${h.id === myId ? "text-gold" : ""}`}>
                <span>
                  {h.down ? "💀" : "❤️"} {h.name}
                </span>
                <span className="num text-muted">
                  {h.down ? `steht mit ${Math.round(h.combatant.maxHp * DUNGEON_REVIVE_HP)}` : h.combatant.hp}/{h.combatant.maxHp}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3 rounded-md bg-night-800 p-3">
          <CreatureSprite sprite={next.sprite} size={56} />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted">Nächster Gegner</p>
            <p className={`font-semibold ${next.boss ? "text-legendary" : ""}`}>
              {next.boss && "👑 "}
              {next.name} <span className="text-xs text-muted">Lv. {next.level}</span>
            </p>
            {next.abilities.map((a) => (
              <p key={a.id ?? a.name} className="text-xs text-danger">
                {a.icon} {a.name}
                {a.aoe && " (trifft alle)"}: {a.description}
              </p>
            ))}
          </div>
        </div>
      </div>

      {chest && <ChestPreview chest={chest} />}

      {error && <p className="text-sm text-danger">{error}</p>}
      {decider === myId ? (
        <div className="flex flex-wrap justify-center gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={busy}
            onClick={exitDungeon}
            className="font-pixel rounded-md border-2 border-gold/70 px-4 py-1.5 text-gold hover:bg-gold/15 disabled:opacity-40"
          >
            🎁 Mit Truhe aussteigen
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={busy}
            onClick={continueDungeon}
            className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-5 py-1.5 text-lg text-danger hover:bg-danger/25 disabled:opacity-40"
          >
            ⚔️ Weiter
          </motion.button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">⏳ {deciderName} entscheidet: weiter oder mit der Truhe aussteigen …</p>
      )}
    </motion.section>
  );
}

/** Inhalt der eigenen Truhe bisher – noch nicht gutgeschrieben. */
function ChestPreview({ chest }: { chest: ReturnType<typeof rollCoopDungeonChest> }) {
  const potions = Object.entries(chest.potions);
  return (
    <div className="rounded-md bg-night-800 p-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">Deine Truhe – verloren, wenn die Gruppe fällt</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xp">+{chest.xp} XP</span>
        {chest.gold > 0 && <Gold amount={chest.gold} sign className="text-gold" />}
        {potions.map(([id, count]) => (
          <span key={id} title={getPotion(id).name}>
            {getPotion(id).icon} × {count}
          </span>
        ))}
        {chest.items.map((item) => (
          <ItemTooltip key={item.uid} stats={getItemStats(item)}>
            <ItemIcon def={getItemStats(item).def} rarity={item.rarity} size={32} />
          </ItemTooltip>
        ))}
      </div>
    </div>
  );
}

function CoopResultPanel({ battle, onLeave }: { battle: CoopBattleState; onLeave: () => void }) {
  const result = useCoopStore((s) => s.result);
  const won = battle.status === "won";
  const dungeon = battle.dungeon !== undefined;
  const title = !won ? "Niederlage" : !dungeon ? "Sieg!" : dungeonCompleted(battle) ? "Dungeon geschafft!" : "Ausgestiegen";
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`panel flex flex-col items-center gap-3 p-5 text-center ${won ? "border-gold" : "border-danger"}`}
    >
      <h2 className={`font-pixel text-3xl ${won ? "text-gold" : "text-danger"}`}>{title}</h2>
      {won && result?.chest ? (
        <DungeonChest chest={result.chest} />
      ) : won ? (
        <p className="max-w-md text-sm text-muted">Beute bekommt nur, wer beim Ende dabei war.</p>
      ) : (
        <p className="max-w-md text-sm text-muted">
          Die ganze Gruppe ist gefallen. {dungeon ? "Die Truhe ist verloren." : "Diesmal gibt es keine Beute."}
        </p>
      )}
      <button onClick={onLeave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
        Zurück zur Gebietskarte
      </button>
    </motion.section>
  );
}

function describe(e: CoopEvent, names: Record<string, string>, bossName: string): string | null {
  const name = (id: string) => (id === "boss" ? bossName : (names[id] ?? id));
  switch (e.type) {
    case "potion":
      return e.revive
        ? `${name(e.heroId)} belebt ${name(e.targetId)} mit ${getPotion(e.potionId).name} wieder.`
        : `${name(e.heroId)} trinkt ${getPotion(e.potionId).name}${e.heal > 0 ? ` (+${e.heal} LP)` : ""}.`;
    case "ability":
      return `${name(e.heroId)} setzt ${getAbility(e.ability).name} ein.`;
    case "selfHeal":
      return `${name(e.heroId)} heilt sich um ${e.heal} LP.`;
    case "guarded":
      return `${name(e.heroId)} wehrt ${e.prevented} Schaden ab.`;
    case "counter":
      return `${name(e.heroId)} schlägt zurück: ${bossName} −${e.damage}.`;
    case "hit":
      return `${e.crit ? "Kritisch! " : ""}${name(e.attacker)} trifft ${name(e.target)} für ${e.damage} Schaden.`;
    case "poison":
      return `Gift: ${name(e.target)} −${e.damage}.`;
    case "burn":
      return `Feuer: ${name(e.target)} −${e.damage}.`;
    case "bleed":
      return `Bluten: ${name(e.target)} −${e.damage}.`;
    case "bossAbility":
      return `${bossName} setzt ${e.name} ein!`;
    case "stunned":
      return `${bossName} ist betäubt und setzt aus.`;
    case "stunResisted":
      return `${bossName} widersteht der Betäubung.`;
    case "blocked":
      return `${name(e.heroId)} blockt den Angriff mit Bollwerk.`;
    case "down":
      return `${name(e.heroId)} ist gefallen!`;
    case "victory":
      return `${bossName} ist besiegt!`;
    case "wipe":
      return "Die ganze Gruppe ist gefallen.";
    case "frozen":
      return `${name(e.heroId)} ist eingefroren und setzt eine Runde aus.`;
    case "skipped":
      return `${name(e.heroId)} ist eingefroren und kann nicht handeln.`;
    case "manaBurn":
      return `${bossName} raubt ${name(e.heroId)} ${e.amount} Mana.`;
    case "drain":
      return `${bossName} heilt sich um ${e.heal} LP.`;
    case "regen":
      return `${name(e.heroId)} regeneriert ${e.heal} LP.`;
  }
}

function CoopLog({ battle, names }: { battle: CoopBattleState; names: Record<string, string> }) {
  const bossName = getCoopEnemy(battle.bossId).name;
  const lines = [...battle.log].reverse().slice(0, 30);
  if (lines.length === 0) return null;
  return (
    <section className="panel p-4">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">Kampfprotokoll</h3>
      <ol className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-sm">
        {lines.map((e, i) => (
          <li key={i}>
            <span className="num mr-2 text-xs text-muted">R{e.round}</span>
            {describe(e, names, bossName)}
          </li>
        ))}
      </ol>
    </section>
  );
}
