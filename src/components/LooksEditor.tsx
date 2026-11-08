import { useState } from "react";
import { DEFAULT_LOOKS, LOOK_OPTIONS, randomLooks, stepLook, type HeroLooks, type LookPart } from "../domain/looks";
import { HAIR_COLORS, SHIRT_COLORS, SKIN_COLORS } from "../game/heroLooks";
import { useGameStore } from "../store/gameStore";
import { Modal } from "./Modal";
import { PixelAvatar } from "./PixelAvatar";

/** Farbfelder für die Teile, die nur eine Farbe sind */
const SWATCHES: Partial<Record<LookPart, Record<string, string>>> = {
  skin: Object.fromEntries(Object.entries(SKIN_COLORS).map(([id, c]) => [id, c.s])),
  hairColor: Object.fromEntries(Object.entries(HAIR_COLORS).map(([id, c]) => [id, c.h])),
  shirt: Object.fromEntries(Object.entries(SHIRT_COLORS).map(([id, c]) => [id, c.a])),
};

const PART_LABELS: Record<LookPart, string> = {
  skin: "Haut",
  hairColor: "Haarfarbe",
  hairStyle: "Frisur",
  beard: "Bart",
  shirt: "Hemd",
};

/** Auswahl des Aussehens: Farbfelder für Haut, Haare und Hemd, Pfeile für Frisur und Bart. */
export function LooksEditor({ looks, onChange }: { looks: HeroLooks; onChange: (looks: HeroLooks) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {(["skin", "hairColor", "hairStyle", "beard", "shirt"] as const).map((part) => {
        const swatches = SWATCHES[part];
        const current = LOOK_OPTIONS[part].find((o) => o.id === looks[part]);
        return (
          <div key={part} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span className="text-muted">{PART_LABELS[part]}</span>
            {swatches ? (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={PART_LABELS[part]}>
                {LOOK_OPTIONS[part].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={looks[part] === o.id}
                    title={o.label}
                    aria-label={o.label}
                    onClick={() => onChange({ ...looks, [part]: o.id })}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      looks[part] === o.id ? "border-gold ring-2 ring-gold/40" : "border-night-700 hover:border-parchment"
                    }`}
                    style={{ backgroundColor: swatches[o.id] }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <StepButton label={`${PART_LABELS[part]}: vorherige`} onClick={() => onChange(stepLook(looks, part, -1))}>
                  ◀
                </StepButton>
                <span className="font-pixel min-w-24 text-center text-lg">{current?.label}</span>
                <StepButton label={`${PART_LABELS[part]}: nächste`} onClick={() => onChange(stepLook(looks, part, 1))}>
                  ▶
                </StepButton>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(randomLooks())}
        className="mt-1 self-start rounded-md border-2 border-night-700 px-3 py-1 text-muted hover:text-parchment"
      >
        🎲 Zufällig
      </button>
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md border-2 border-night-700 bg-night-900 px-2 text-muted hover:text-parchment"
    >
      {children}
    </button>
  );
}

/** Aussehen nachträglich ändern (Charakterbogen) – mit Vorschau, erst „Speichern“ übernimmt. */
export function LooksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useGameStore((s) => s.character.looks ?? DEFAULT_LOOKS);
  const setLooks = useGameStore((s) => s.setLooks);
  const [draft, setDraft] = useState(saved);
  const [wasOpen, setWasOpen] = useState(open);
  // Beim Öffnen mit dem gespeicherten Aussehen beginnen
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(saved);
  }

  return (
    <Modal open={open} title="Aussehen ändern" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-lg bg-night-800 p-3">
          <PixelAvatar size={112} looks={draft} />
        </div>
        <LooksEditor looks={draft} onChange={setDraft} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border-2 border-night-700 px-3 py-1 text-muted hover:text-parchment">
          Abbrechen
        </button>
        <button
          onClick={() => {
            setLooks(draft);
            onClose();
          }}
          className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25"
        >
          Speichern
        </button>
      </div>
    </Modal>
  );
}
