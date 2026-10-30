// Gemeinsame Bausteine der Aktionsleiste im Solo- und Koop-Kampf:
// Zustände von Held und Gegner als kleine Plaketten, Abschnitte mit
// Überschrift und die Knöpfe der Fähigkeiten.

import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { AbilityDef, Guard } from "../domain/abilities";
import { ADD_ROLES, DRUMMER_BONUS, getBossPhase, SHIELD_DAMAGE_TAKEN, type AddRole } from "../domain/bossMechanics";
import type { ActiveBuff, DamageOverTime } from "../domain/combat";
import { BUFF_LABELS, type BuffKind } from "../domain/potions";
import { Hint } from "./HoverCard";

export interface StatusChip {
  key: string;
  icon: string;
  text: string;
  /** Verbleibende Runden – fehlt bei Wirkungen bis zum nächsten Angriff bzw. Kampfende */
  rounds?: number;
  /** good: hilft dir · bad: schadet dir · foe: schwächt den Gegner */
  tone: "good" | "bad" | "foe";
  title: string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

interface HeroEffects {
  poison?: DamageOverTime;
  burn?: DamageOverTime;
  bleed?: DamageOverTime;
  bulwark?: boolean;
  guard?: Guard;
  empower?: ActiveBuff;
}

/** Was gerade auf dem Helden wirkt – Verstärkungen zuerst, dann Schaden über Zeit. */
export function heroStatusChips(buffs: Partial<Record<BuffKind, ActiveBuff>>, effects: HeroEffects): StatusChip[] {
  const chips: StatusChip[] = [];
  for (const [kind, buff] of Object.entries(buffs) as [BuffKind, ActiveBuff][]) {
    chips.push({
      key: kind,
      icon: kind === "attack" ? "🔥" : "🪨",
      text: `+${pct(buff.percent)} ${BUFF_LABELS[kind]}`,
      rounds: buff.roundsLeft,
      tone: "good",
      title: `Trank: +${pct(buff.percent)} ${BUFF_LABELS[kind]}`,
    });
  }
  if (effects.empower) {
    chips.push({ key: "empower", icon: "📯", text: `+${pct(effects.empower.percent)} Schaden`, rounds: effects.empower.roundsLeft, tone: "good", title: "Kriegsschrei" });
  }
  if (effects.bulwark) chips.push({ key: "bulwark", icon: "🛡️", text: "Bollwerk", tone: "good", title: "Blockt den nächsten Angriff komplett" });
  if (effects.guard) {
    chips.push(
      effects.guard.reflect
        ? { key: "guard", icon: "🔁", text: "Vergeltung", tone: "good", title: "Halbiert den nächsten Angriff und wirft den Schaden zurück" }
        : { key: "guard", icon: "🤺", text: "Parade", tone: "good", title: "Halbiert den nächsten Angriff, danach Konter" },
    );
  }
  const dots = [
    ["poison", "☠️", "Gift"],
    ["burn", "🔥", "Feuer"],
    ["bleed", "🩸", "Bluten"],
  ] as const;
  for (const [kind, icon, label] of dots) {
    const effect = effects[kind];
    if (effect) chips.push({ key: kind, icon, text: `${label} −${effect.damage}`, rounds: effect.roundsLeft, tone: "bad", title: `${label}: ${effect.damage} Schaden pro Runde` });
  }
  return chips;
}

interface EnemyEffects {
  poison?: DamageOverTime;
  burn?: DamageOverTime;
  bleed?: DamageOverTime;
  armorBreak?: number;
  weaken?: ActiveBuff;
  vulnerable?: ActiveBuff;
  stunImmunity?: number;
}

/** Was gerade auf dem Gegner wirkt. */
export function enemyStatusChips(effects: EnemyEffects): StatusChip[] {
  const chips: StatusChip[] = [];
  const dots = [
    ["poison", "☠️", "Gift"],
    ["burn", "🔥", "Feuer"],
    ["bleed", "🩸", "Bluten"],
  ] as const;
  for (const [kind, icon, label] of dots) {
    const effect = effects[kind];
    if (effect) chips.push({ key: kind, icon, text: `${label} −${effect.damage}`, rounds: effect.roundsLeft, tone: "foe", title: `${label}: ${effect.damage} Schaden pro Runde` });
  }
  if (effects.armorBreak) {
    chips.push({ key: "armorBreak", icon: "💥", text: `Rüstung −${pct(effects.armorBreak)}`, tone: "foe", title: "Bis zum Ende des Kampfes" });
  }
  if (effects.weaken) {
    chips.push({ key: "weaken", icon: "🕯️", text: `Schaden −${pct(effects.weaken.percent)}`, rounds: effects.weaken.roundsLeft, tone: "foe", title: "Geschwächt: macht weniger Schaden" });
  }
  if (effects.vulnerable) {
    chips.push({ key: "vulnerable", icon: "🎯", text: `erleidet +${pct(effects.vulnerable.percent)}`, rounds: effects.vulnerable.roundsLeft, tone: "foe", title: "Verwundbar: erleidet mehr Schaden" });
  }
  if (effects.stunImmunity) {
    chips.push({ key: "stunImmunity", icon: "🧱", text: "Immun gegen Betäubung", rounds: effects.stunImmunity, tone: "foe", title: "Nach einer Betäubung kann der Boss einige Runden nicht erneut betäubt werden" });
  }
  return chips;
}

/**
 * Was die Boss-Mechaniken gerade bewirken (bossMechanics.ts): Raserei nach der
 * zweiten Phase, Schutz durch den Schildträger, Anfeuern durch den Trommler.
 * Rot getönt – es hilft dem Boss.
 */
export function bossMechanicChips(
  bossId: string,
  phase: boolean | undefined,
  adds: readonly { role?: AddRole; combatant: { hp: number } }[],
): StatusChip[] {
  const chips: StatusChip[] = [];
  const phaseDef = getBossPhase(bossId);
  if (phase && phaseDef?.enrage) {
    chips.push({ key: "enrage", icon: phaseDef.icon, text: `Raserei +${pct(phaseDef.enrage)}`, tone: "bad", title: `${phaseDef.name}: ${phaseDef.description}` });
  }
  const alive = (role: AddRole) => adds.some((a) => a.role === role && a.combatant.hp > 0);
  if (alive("shield")) {
    chips.push({ key: "shield", icon: ADD_ROLES.shield.icon, text: `Geschützt −${pct(1 - SHIELD_DAMAGE_TAKEN)}`, tone: "bad", title: ADD_ROLES.shield.description });
  }
  if (alive("drummer")) {
    chips.push({ key: "drummer", icon: ADD_ROLES.drummer.icon, text: `Angefeuert +${pct(DRUMMER_BONUS)}`, tone: "bad", title: ADD_ROLES.drummer.description });
  }
  if (alive("healer")) {
    chips.push({ key: "healer", icon: ADD_ROLES.healer.icon, text: "Wird geheilt", tone: "bad", title: ADD_ROLES.healer.description });
  }
  return chips;
}

/** So knapp über der Schwelle kündigt sich die zweite Phase an (Anteil der maximalen LP). */
const PHASE_WARNING = 0.15;

/** Kündigt die zweite Phase des Bosses an, sobald er sich ihrer Schwelle nähert. */
export function PhaseWarning({ bossId, phase, boss }: { bossId: string; phase: boolean | undefined; boss: { hp: number; maxHp: number } }) {
  const def = getBossPhase(bossId);
  if (!def || phase || boss.hp <= 0 || boss.hp >= boss.maxHp * (def.at + PHASE_WARNING)) return null;
  return (
    <motion.p
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="rounded-md border-2 border-gold/70 bg-gold/10 px-3 py-1.5 text-sm text-gold"
    >
      ⚠️ Unter {pct(def.at)} Lebenspunkten wechselt der Boss in seine zweite Phase:{" "}
      <strong>
        {def.icon} {def.name}
      </strong>{" "}
      – {def.description}
    </motion.p>
  );
}

const TONES: Record<StatusChip["tone"], string> = {
  good: "border-xp/40 bg-xp/10 text-xp",
  bad: "border-danger/40 bg-danger/10 text-danger",
  foe: "border-epic/40 bg-epic/10 text-epic",
};

/** Eine Seite (du / der Gegner): Überschrift, optional Werte, darunter die Plaketten. */
export function StatusSide({ title, chips, children }: { title: string; chips: StatusChip[]; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md bg-night-800/70 p-2">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      {children}
      <div className="flex min-h-6 flex-wrap gap-1">
        {chips.length === 0 ? (
          <span className="text-xs text-muted/70">Keine Effekte</span>
        ) : (
          chips.map((chip) => (
            <Hint key={chip.key} text={chip.title}>
              <span className={`rounded border px-1.5 py-0.5 text-xs ${TONES[chip.tone]}`}>
                {chip.icon} {chip.text}
                {chip.rounds !== undefined && <span className="num opacity-80"> · {chip.rounds}R</span>}
              </span>
            </Hint>
          ))
        )}
      </div>
    </div>
  );
}

/** Ein Gegner zur Zielwahl: der Boss (ohne `uid`) oder ein Begleiter. */
export interface TargetOption {
  uid?: string;
  combatant: { name: string; hp: number; maxHp: number };
  effects: EnemyEffects;
  boss: boolean;
  /** Aufgabe des Begleiters (Heiler, Schildträger, Trommler) */
  role?: AddRole;
}

/** Boss und Begleiter als Knöpfe: Lebenspunkte und Effekte im Blick, das gewählte Ziel hervorgehoben. */
export function TargetPicker({
  foes,
  selected,
  disabled,
  onChoose,
}: {
  foes: TargetOption[];
  selected: string | undefined;
  disabled: boolean;
  onChoose: (uid: string | undefined) => void;
}) {
  return (
    <ActionGroup label="Ziel" hint="Fällt der Boss, ist der Kampf gewonnen · Flächen-Fähigkeiten treffen mehrere">
      <div className="grid gap-2 sm:grid-cols-3">
        {foes.map(({ uid, combatant, effects, boss, role }) => {
          const down = combatant.hp === 0;
          const isSelected = selected === uid;
          const roleDef = role && ADD_ROLES[role];
          return (
            <button
              key={uid ?? "boss"}
              type="button"
              disabled={disabled || down}
              onClick={() => onChoose(uid)}
              aria-pressed={isSelected}
              title={roleDef ? `${roleDef.name}: ${roleDef.description}` : undefined}
              className={`flex min-w-0 flex-col gap-1 rounded-md border-2 px-2 py-1.5 text-left disabled:cursor-not-allowed ${
                isSelected ? "border-gold bg-gold/10" : "border-night-600 hover:border-muted"
              } ${down ? "opacity-40" : ""}`}
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-bold">
                  {isSelected && "▼ "}
                  {boss && "👑 "}
                  {roleDef && `${roleDef.icon} `}
                  {combatant.name}
                </span>
                <span className="num shrink-0 text-xs text-muted">
                  {down ? "besiegt" : `${combatant.hp}/${combatant.maxHp}`}
                </span>
              </span>
              {roleDef && <span className="truncate text-xs text-danger">{roleDef.name}</span>}
              <span className="h-1.5 overflow-hidden rounded-sm bg-night-700">
                <span className="block h-full bg-danger" style={{ width: `${(combatant.hp / combatant.maxHp) * 100}%` }} />
              </span>
              <span className="flex min-h-4 flex-wrap gap-1 text-xs">
                {enemyStatusChips(effects).map((chip) => (
                  <span key={chip.key} title={chip.title}>
                    {chip.icon}
                    {chip.rounds !== undefined && <span className="num text-muted">{chip.rounds}</span>}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </ActionGroup>
  );
}

/** Abschnitt der Aktionsleiste mit kleiner Überschrift und optionalem Hinweis rechts. */
export function ActionGroup({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Knopf einer Fähigkeit: Symbol, Name, Manakosten – und warum sie gerade nicht geht. */
export function AbilityButton({
  ability,
  blocker,
  disabled,
  onClick,
}: {
  ability: AbilityDef;
  blocker: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  // "Abklingzeit: noch 2 Runden." → "2 Runden"
  const cooling = blocker?.match(/^Abklingzeit: noch (.+)\.$/)?.[1] ?? null;
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      disabled={disabled || blocker !== null}
      onClick={onClick}
      title={blocker ? `${ability.description}\n${blocker}` : ability.description}
      className="flex items-center gap-2 rounded-md border-2 border-intellect/70 bg-intellect/10 px-2 py-1.5 text-left hover:bg-intellect/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-xl" aria-hidden>
        {ability.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-pixel block truncate text-intellect">{ability.name}</span>
        <span className="block truncate text-xs text-muted">
          {cooling ? (
            <span className="text-gold">⏳ wieder bereit in {cooling}</span>
          ) : blocker?.startsWith("Nicht genug Mana") ? (
            "zu wenig Mana"
          ) : (
            ability.description
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end text-xs">
        <span className="num text-intellect">{ability.manaCost} 💧</span>
        <span className="num text-muted" title="Abklingzeit in Runden">
          ⏳ {ability.cooldown}
        </span>
      </span>
    </motion.button>
  );
}
