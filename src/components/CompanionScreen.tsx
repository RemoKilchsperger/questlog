import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { formatCountdown } from "../domain/calendar";
import {
  companionGearScore,
  companionLevel,
  isBusy,
  isMissionDone,
  MISSION_DIFFICULTIES,
  missionChance,
  missionDurationMs,
  missionLoot,
  recruitPrice,
  requiredGearScore,
  rerollRecruitsPrice,
  TAVERN_RULES,
  getTrait,
  traitText,
  type ActiveMission,
  type Companion,
  type CompanionTrait,
  type MissionDef,
  type MissionOutcome,
} from "../domain/companions";
import { AREAS } from "../domain/creatures";
import { itemScore } from "../domain/gearScore";
import { ARMOR_SLOTS, getItemStats, SLOT_ICONS, SLOT_LABELS, WEAPON_SLOTS } from "../domain/items";
import { getLevel } from "../domain/leveling";
import type { EquipSlot, OwnedItem } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Essence, Gold } from "./Gold";
import { Hint } from "./HoverCard";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { itemName, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";
import { MaterialGain } from "./materialUi";
import { Modal } from "./Modal";
import { PixelAvatar } from "./PixelAvatar";
import { useNow } from "./useNow";
import { XpBar } from "./XpBar";

// Begleiter und Missionen in der Taverne (docs/begleiter.md).

const BUTTON = "rounded-md border-2 px-2 py-0.5 text-sm disabled:cursor-not-allowed disabled:opacity-40";
const GOLD_BUTTON = `${BUTTON} border-gold bg-gold/15 text-gold hover:bg-gold/25`;
const PLAIN_BUTTON = `${BUTTON} border-night-700 text-muted hover:text-parchment`;

const SLOTS: readonly EquipSlot[] = [...ARMOR_SLOTS, ...WEAPON_SLOTS];

function TraitChip({ trait }: { trait: CompanionTrait }) {
  const def = getTrait(trait.id);
  return (
    <Hint heading={`${def.name} (${rarityLabel(trait.rarity)})`} text={traitText(trait)}>
      <span className={`inline-flex items-center gap-1 rounded-md border-2 bg-night-900 px-1.5 text-xs ${RARITY_BORDER[trait.rarity]} ${RARITY_TEXT[trait.rarity]}`}>
        <span aria-hidden>{def.icon}</span>
        {def.name}
      </span>
    </Hint>
  );
}

function Traits({ traits }: { traits: readonly CompanionTrait[] }) {
  if (traits.length === 0) return <span className="text-xs text-muted">keine Traits</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {traits.map((t) => (
        <TraitChip key={t.id} trait={t} />
      ))}
    </span>
  );
}

/* ───────────── Begleiter ───────────── */

/** Eigene Begleiter und die Kandidaten des Tages. */
export function CompanionsPanel() {
  const tier = useGameStore((s) => s.village.tavern);
  const companions = useGameStore((s) => s.companions);
  const pool = useGameStore((s) => s.recruitPool);
  const gold = useGameStore((s) => s.character.gold);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const recruitCompanion = useGameStore((s) => s.recruitCompanion);
  const rerollRecruits = useGameStore((s) => s.rerollRecruits);
  const dismiss = useGameStore((s) => s.dismissCompanion);
  const active = useGameStore((s) => s.activeMissions);
  const [outfitting, setOutfitting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<Companion | null>(null);
  const closeOutfit = useCallback(() => setOutfitting(null), []);
  const closeDismiss = useCallback(() => setDismissing(null), []);
  const slots = TAVERN_RULES[tier].slots;
  const full = companions.length >= slots;
  const rerollPrice = rerollRecruitsPrice(level);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Begleiter gehen für dich auf Missionen. Rüste sie mit Items aus deinem Inventar aus: Je höher ihr Gearscore,
        desto besser die Erfolgschance. Sie werden höchstens so stark wie du.
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="font-pixel text-lg">
          Deine Begleiter <span className="text-sm text-muted">({companions.length} / {slots} Plätze)</span>
        </h3>
        {companions.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-night-700 p-3 text-center text-sm text-muted">
            Noch niemand da – wirb unten jemanden an.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {companions.map((c) => {
              const busy = isBusy(active, c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2">
                  <PixelAvatar size={56} equipment={c.equipment} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {c.name} <span className="text-xs text-muted">Lv. {companionLevel(c)}</span>
                    </p>
                    <div className="max-w-48">
                      <XpBar totalXp={c.totalXp} size="sm" />
                    </div>
                    <p className="text-xs">
                      <Hint text="Gearscore mit „Kampferprobt“ – bestimmt die Erfolgschance auf Missionen.">
                        <span className="text-gold">GS {companionGearScore(c)}</span>
                      </Hint>
                      {busy && <span className="ml-2 text-xp">🗺️ unterwegs</span>}
                    </p>
                    <Traits traits={c.traits} />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button className={GOLD_BUTTON} disabled={busy} onClick={() => setOutfitting(c.id)} title={busy ? "Unterwegs" : undefined}>
                      Ausrüsten
                    </button>
                    <button className={PLAIN_BUTTON} disabled={busy} onClick={() => setDismissing(c)} title={busy ? "Unterwegs" : undefined}>
                      Entlassen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-pixel text-lg">Kandidaten heute</h3>
          <button
            className={PLAIN_BUTTON}
            disabled={pool.rerolled || gold < rerollPrice}
            onClick={rerollRecruits}
            title={pool.rerolled ? "Heute schon neu gewürfelt" : "Einmal am Tag neue Kandidaten"}
          >
            🎲 Neue Gesichter <Gold amount={rerollPrice} />
          </button>
        </div>
        {pool.recruits.length === 0 ? (
          <p className="text-sm text-muted">Heute kommt niemand mehr. Morgen sitzen neue Leute am Tresen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pool.recruits.map((r) => {
              const price = recruitPrice(r);
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2">
                  <span className="text-3xl" aria-hidden>
                    🧑
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {r.name} <span className="text-xs text-muted">Lv. {companionLevel(r)}</span>
                    </p>
                    <Traits traits={r.traits} />
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    className={GOLD_BUTTON}
                    disabled={full || gold < price}
                    onClick={() => recruitCompanion(r.id)}
                    title={full ? "Alle Plätze belegt – baue die Taverne aus oder entlasse jemanden" : gold < price ? "Nicht genug Gold" : "Anwerben"}
                  >
                    Anwerben <Gold amount={price} className="font-bold" />
                  </motion.button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={outfitting !== null} title="Ausrüsten" onClose={closeOutfit} wide>
        {outfitting && <OutfitScreen companionId={outfitting} />}
      </Modal>
      <ConfirmDialog
        open={dismissing !== null}
        title={dismissing ? `${dismissing.name} entlassen?` : ""}
        confirmLabel="Entlassen"
        onCancel={closeDismiss}
        onConfirm={() => {
          if (dismissing) dismiss(dismissing.id);
          setDismissing(null);
        }}
      >
        <p>Die Ausrüstung kommt zurück in dein Inventar. Das Gold fürs Anwerben gibt es nicht zurück.</p>
      </ConfirmDialog>
    </div>
  );
}

/** Ausrüstung eines Begleiters: angelegte Items und alles aus dem Inventar, was er tragen kann. */
function OutfitScreen({ companionId }: { companionId: string }) {
  const companion = useGameStore((s) => s.companions.find((c) => c.id === companionId));
  const inventory = useGameStore((s) => s.inventory);
  const equip = useGameStore((s) => s.companionEquip);
  const unequip = useGameStore((s) => s.companionUnequip);
  const equipBest = useGameStore((s) => s.companionEquipBest);
  if (!companion) return null;
  const level = companionLevel(companion);
  const wearable = inventory
    .filter((o) => getItemStats(o).def.requiredLevel <= level)
    .sort((a, b) => itemScore(b) - itemScore(a));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PixelAvatar size={80} equipment={companion.equipment} />
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-xl">{companion.name}</p>
            <p className="text-sm">
              Lv. {level} · <span className="text-gold">GS {companionGearScore(companion)}</span>
            </p>
            <Traits traits={companion.traits} />
          </div>
        </div>
        <button className={GOLD_BUTTON} onClick={() => equipBest(companion.id)}>
          ✨ Bestes anlegen
        </button>
        <ul className="flex flex-col gap-1.5">
          {SLOTS.map((slot) => {
            const owned = companion.equipment[slot];
            return (
              <li key={slot} className="flex items-center gap-2 rounded-md border-2 border-night-700 bg-night-800 px-2 py-1">
                <span className="w-24 shrink-0 text-xs text-muted">
                  {SLOT_ICONS[slot]} {SLOT_LABELS[slot]}
                </span>
                {owned ? (
                  <>
                    <ItemLabel owned={owned} />
                    <button className={PLAIN_BUTTON} onClick={() => unequip(companion.id, slot)}>
                      Ablegen
                    </button>
                  </>
                ) : (
                  <span className="flex-1 text-xs text-muted">leer</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          Angelegte Items gehören dem Begleiter, bis du sie wieder ablegst. Verkaufen, zerlegen und verbessern geht erst
          danach.
        </p>
      </section>
      <section className="panel flex flex-col gap-2 p-4">
        <h3 className="font-pixel text-lg">Aus dem Inventar (bis Lv. {level})</h3>
        {wearable.length === 0 ? (
          <p className="text-sm text-muted">Nichts in deinem Inventar, was {companion.name} tragen kann.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {wearable.map((owned) => (
              <li key={owned.uid} className="flex items-center gap-2 rounded-md border-2 border-night-700 bg-night-800 px-2 py-1">
                <ItemLabel owned={owned} />
                <button className={GOLD_BUTTON} onClick={() => equip(companion.id, owned.uid)}>
                  Anlegen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ItemLabel({ owned }: { owned: OwnedItem }) {
  const stats = getItemStats(owned);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ItemTooltip stats={stats}>
        <ItemIcon def={stats.def} rarity={stats.rarity} size={28} />
      </ItemTooltip>
      <span className={`min-w-0 flex-1 truncate text-sm ${RARITY_TEXT[stats.rarity]}`}>{itemName(stats)}</span>
      <Hint text="Item-Score: Item-Level × Seltenheit – der Gearscore ist der Durchschnitt über alle 7 Plätze.">
        <span className="shrink-0 text-xs text-muted">Wert {Math.round(itemScore(owned))}</span>
      </Hint>
    </span>
  );
}

/* ───────────── Missionen ───────────── */

const percent = (value: number) => `${Math.round(value * 100)} %`;
const formatMinutes = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} Std.${minutes % 60 ? ` ${minutes % 60} Min.` : ""}` : `${minutes} Min.`;
};

/** Laufende Missionen und die Tafel des Tages. */
export function MissionsPanel() {
  const board = useGameStore((s) => s.missionBoard);
  const active = useGameStore((s) => s.activeMissions);
  const companions = useGameStore((s) => s.companions);
  const claim = useGameStore((s) => s.claimMission);
  const cancel = useGameStore((s) => s.cancelMission);
  const now = useNow(1000);
  const [result, setResult] = useState<{ mission: ActiveMission; outcome: MissionOutcome } | null>(null);
  const [cancelling, setCancelling] = useState<ActiveMission | null>(null);
  const closeResult = useCallback(() => setResult(null), []);
  const closeCancel = useCallback(() => setCancelling(null), []);
  const names = (ids: readonly string[]) => ids.map((id) => companions.find((c) => c.id === id)?.name ?? "?").join(", ");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Schick deine Begleiter los – die Zeit läuft weiter, auch wenn das Spiel zu ist. Jede Mission braucht genau so
        viele Begleiter, wie angegeben. Neue Missionen gibt es jeden Tag.
      </p>

      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-pixel text-lg">Unterwegs</h3>
          <ul className="flex flex-col gap-2">
            {active.map((a) => {
              const done = isMissionDone(a, now.getTime());
              const progress = Math.min(1, (now.getTime() - a.start) / Math.max(1, a.end - a.start));
              return (
                <li key={a.mission.id} className={`rounded-md border-2 bg-night-800 p-2 ${done ? "border-xp" : "border-night-700"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.mission.title}</p>
                      <p className="text-xs text-muted">
                        {names(a.companionIds)} · Erfolgschance {percent(a.chance)}
                      </p>
                    </div>
                    {done ? (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className={GOLD_BUTTON}
                        onClick={() => {
                          const outcome = claim(a.mission.id);
                          if (outcome) setResult({ mission: a, outcome });
                        }}
                      >
                        📜 Bericht abholen
                      </motion.button>
                    ) : (
                      <>
                        <span className="text-sm tabular-nums text-muted">⏳ {formatCountdown(now, new Date(a.end))}</span>
                        <button className={PLAIN_BUTTON} onClick={() => setCancelling(a)}>
                          Abbrechen
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-night-700">
                    <div className="h-full bg-xp" style={{ width: `${progress * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-pixel text-lg">Missionstafel</h3>
        {companions.length === 0 && <p className="text-sm text-muted">Wirb zuerst Begleiter an, dann kannst du sie losschicken.</p>}
        <ul className="flex flex-col gap-2">
          {board.missions.map((m) => (
            <MissionCard key={m.id} mission={m} taken={board.taken.includes(m.id)} />
          ))}
        </ul>
      </section>

      <Modal open={result !== null} title={result ? result.mission.mission.title : ""} onClose={closeResult}>
        {result && <MissionReport mission={result.mission} outcome={result.outcome} names={names} />}
      </Modal>
      <ConfirmDialog
        open={cancelling !== null}
        title={cancelling ? `${cancelling.mission.title} abbrechen?` : ""}
        confirmLabel="Abbrechen"
        onCancel={closeCancel}
        onConfirm={() => {
          if (cancelling) cancel(cancelling.mission.id);
          setCancelling(null);
        }}
      >
        <p>Die Begleiter kommen sofort zurück, aber ohne Beute und EP. Die Mission ist für heute vergeben.</p>
      </ConfirmDialog>
    </div>
  );
}

function MissionCard({ mission, taken }: { mission: MissionDef; taken: boolean }) {
  const companions = useGameStore((s) => s.companions);
  const active = useGameStore((s) => s.activeMissions);
  const start = useGameStore((s) => s.startMission);
  const [selected, setSelected] = useState<string[]>([]);
  const area = AREAS.find((a) => a.id === mission.areaId);
  const difficulty = MISSION_DIFFICULTIES[mission.difficulty];
  const free = companions.filter((c) => !isBusy(active, c.id));
  const group = companions.filter((c) => selected.includes(c.id) && free.includes(c));
  const ready = group.length === mission.size;
  // Vorschau: mit der Auswahl, sonst mit den besten freien Begleitern
  const preview = ready ? group : [...free].sort((a, b) => companionGearScore(b) - companionGearScore(a)).slice(0, mission.size);
  const loot = missionLoot(mission, preview);
  const chance = preview.length === mission.size ? missionChance(mission, preview) : null;
  const difficultyColor = mission.difficulty === "heroic" ? "text-epic" : mission.difficulty === "hard" ? "text-rare" : "text-parchment";

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < mission.size ? [...s, id] : [...s.slice(1), id]));

  return (
    <li className={`rounded-md border-2 border-night-700 bg-night-800 p-3 ${taken ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-semibold">{mission.title}</p>
        <p className={`text-sm ${difficultyColor}`}>{difficulty.label}</p>
      </div>
      <p className="text-xs text-muted">
        {area?.name} · Lv. {mission.level} · ⏱️ {formatMinutes(missionDurationMs(mission, ready ? group : []))} · 👥{" "}
        {mission.size} Begleiter ·{" "}
        <Hint text="Geforderter Gearscore: bei gleichem Gearscore der Gruppe 50 % Erfolgschance.">
          <span className="text-gold">GS {requiredGearScore(mission)}</span>
        </Hint>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
        <span className="text-muted">Beute bei Erfolg:</span>
        <Gold amount={loot.gold} />
        <Essence amount={loot.essence} className="text-essence" />
        <MaterialGain materials={loot.materials} />
        <span className="text-muted">🎁 Item {percent(loot.itemChance)}</span>
      </p>
      {taken ? (
        <p className="mt-2 text-sm text-muted">✓ Heute schon angenommen</p>
      ) : (
        free.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {free.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                aria-pressed={selected.includes(c.id)}
                className={`rounded-md border-2 px-2 py-0.5 text-xs ${
                  selected.includes(c.id) ? "border-xp bg-xp/15 text-xp" : "border-night-700 text-muted hover:text-parchment"
                }`}
              >
                {c.name} · GS {companionGearScore(c)}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              {chance !== null && (
                <Hint text={ready ? "Erfolgschance mit deiner Auswahl" : "Erfolgschance mit deinen besten freien Begleitern"}>
                  <span className={`text-sm ${chance >= 0.5 ? "text-xp" : "text-danger"}`}>
                    {ready ? "" : "bis "}
                    {percent(chance)}
                  </span>
                </Hint>
              )}
              <motion.button
                whileTap={{ scale: 0.9 }}
                className={GOLD_BUTTON}
                disabled={!ready}
                title={ready ? undefined : `Wähle ${mission.size} Begleiter`}
                onClick={() => {
                  start(mission.id, group.map((c) => c.id));
                  setSelected([]);
                }}
              >
                Losschicken
              </motion.button>
            </span>
          </div>
        )
      )}
      {!taken && free.length < mission.size && companions.length > 0 && (
        <p className="mt-1 text-xs text-muted">Es sind nicht genug Begleiter frei.</p>
      )}
    </li>
  );
}

function MissionReport({
  mission,
  outcome,
  names,
}: {
  mission: ActiveMission;
  outcome: MissionOutcome;
  names: (ids: readonly string[]) => string;
}) {
  const companions = useGameStore((s) => s.companions);
  const item = outcome.item && getItemStats(outcome.item);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className={`font-pixel text-2xl ${outcome.success ? "text-xp" : "text-danger"}`}>
        {outcome.success ? "✓ Erfolgreich" : "✗ Gescheitert"}
      </p>
      <p className="text-sm text-muted">
        {names(mission.companionIds)} {mission.companionIds.length === 1 ? "ist" : "sind"} zurück
        {outcome.success ? " – mit Beute." : ", aber mit leeren Händen."}
      </p>
      {outcome.success && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {outcome.gold > 0 && <Gold amount={outcome.gold} sign className="font-bold text-gold" />}
          {outcome.essence > 0 && <Essence amount={outcome.essence} sign className="font-bold text-essence" />}
          <MaterialGain materials={outcome.materials} />
        </div>
      )}
      {item && (
        <span className={`flex items-center gap-2 rounded-md border-2 bg-night-800 px-2 py-1 ${RARITY_BORDER[item.rarity]}`}>
          <ItemTooltip stats={item}>
            <ItemIcon def={item.def} rarity={item.rarity} size={36} />
          </ItemTooltip>
          <span className={RARITY_TEXT[item.rarity]}>{itemName(item)}</span>
        </span>
      )}
      <ul className="text-sm">
        {mission.companionIds.map((id) => {
          const c = companions.find((x) => x.id === id);
          return (
            <li key={id} className="text-xp">
              {c?.name ?? "?"}: +{outcome.xp[id] ?? 0} EP{c && ` · jetzt Lv. ${companionLevel(c)}`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Anzahl fertiger Missionen – für das Zeichen an der Taverne. */
export function useReadyMissions(): number {
  const now = useNow();
  return useGameStore((s) => s.activeMissions.filter((a) => isMissionDone(a, now.getTime())).length);
}
