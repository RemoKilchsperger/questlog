// Klassenleiste und Signatur-Knopf (docs/klassen-neukonzept.md 4.1, 6): vier Ladungen, die sich nach der
// Klasse füllen. Ist die Leiste voll, leuchtet der Knopf. Passt neben Angreifen und Abwehren in die
// Aktionsleiste – auf dem Handy über die ganze Breite. Solo und Koop nutzen denselben Knopf.

import { motion } from "motion/react";
import { CHARGE_MAX, classKit, ROLE_LABELS } from "../domain/classKit";
import { getHeroClass, type HeroClassId } from "../domain/heroClasses";
import { Kbd } from "./BattleStatus";
import { Hint } from "./HoverCard";

/** Taste für die Signatur */
export const SIGNATURE_KEY = "f";

/** Die vier Ladungen als kleine Kästchen. */
export function ChargePips({ charge, className = "" }: { charge: number; className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`} aria-label={`Klassenleiste ${charge} von ${CHARGE_MAX}`}>
      {Array.from({ length: CHARGE_MAX }, (_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ scale: i < charge ? [1.4, 1] : 1 }}
          transition={{ duration: 0.25 }}
          className={`inline-block h-2.5 w-2.5 rounded-[2px] border ${i < charge ? "border-gold bg-gold" : "border-night-600 bg-night-800"}`}
        />
      ))}
    </span>
  );
}

/** Hilfetext einer Klasse: Rolle, Leiste, Signatur. */
export function signatureHint(heroClass: HeroClassId): string {
  const kit = classKit(heroClass);
  const roles = kit.roles.map((r) => ROLE_LABELS[r].name).join(" / ");
  return `${kit.signature.description} Volle Leiste, kein Mana, keine Abklingzeit. ${kit.gauge.name}: ${kit.gauge.text} Höchstens 2 Ladungen pro Runde, jeder Kampf beginnt leer. Rolle: ${roles}.`;
}

/**
 * Signatur-Knopf mit der Klassenleiste. `blocker`: warum er gerade nicht geht (null: Leiste voll).
 * Ohne Klasse zeigt er nichts.
 */
export function SignatureButton({
  heroClass,
  charge,
  blocker,
  disabled,
  onClick,
  className = "",
}: {
  heroClass: HeroClassId | null | undefined;
  charge: number | undefined;
  blocker: string | null;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (!heroClass) return null;
  const { signature } = classKit(heroClass);
  const ready = blocker === null;
  return (
    <Hint heading={`${signature.icon} ${signature.name} (${getHeroClass(heroClass).name})`} text={signatureHint(heroClass)} className={`flex ${className}`}>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={disabled || !ready}
        onClick={onClick}
        animate={ready && !disabled ? { boxShadow: ["0 0 0px #f5c542", "0 0 12px #f5c542", "0 0 0px #f5c542"] } : { boxShadow: "0 0 0px #f5c542" }}
        transition={ready ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }}
        className={`font-pixel flex w-full flex-col items-center justify-center rounded-md border-2 px-3 py-1 text-lg leading-tight disabled:cursor-not-allowed ${
          ready ? "border-gold bg-gold/20 text-gold hover:bg-gold/30" : "border-night-600 bg-night-800 text-muted"
        } ${disabled && ready ? "opacity-40" : ""}`}
      >
        <span>
          {signature.icon} {signature.name} <Kbd>F</Kbd>
        </span>
        <ChargePips charge={charge ?? 0} className="mt-0.5" />
      </motion.button>
    </Hint>
  );
}
