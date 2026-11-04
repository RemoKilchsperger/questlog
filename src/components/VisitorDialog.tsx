import { motion } from "motion/react";
import { useState } from "react";
import { formatCountdown } from "../domain/calendar";
import { getFood } from "../domain/food";
import { getItem } from "../domain/items";
import { effectOf, getItemEffect } from "../domain/itemEffects";
import { getPotion } from "../domain/potions";
import { isQuestComplete, questGoalText, questTarget, type QuestDef } from "../domain/quests";
import { materialEntries } from "../domain/village";
import { chapterQuest, getFixedVisitor, RECIPE_KNOWN_XP_FACTOR, wandererTemplate, type VisitorGift } from "../domain/visitors";
import { getVisitorSprite } from "../game/visitorSprites";
import { useGameStore, type VisitorOutcome } from "../store/gameStore";
import { Gold } from "./Gold";
import { RARITY_TEXT } from "./itemUi";
import { Modal } from "./Modal";
import { PixelSprite } from "./PixelSprite";
import { useNow } from "./useNow";

export type VisitorKind = "story" | "wanderer";

/** Gespräch mit einem Besucher: Geschichte, Bitte annehmen, Fortschritt, abgeben – und am Ende das Geschenk. */
export function VisitorDialog({ who, onClose }: { who: VisitorKind | null; onClose: () => void }) {
  const [outcome, setOutcome] = useState<VisitorOutcome | null>(null);
  const close = () => {
    setOutcome(null);
    onClose();
  };
  const header = useVisitorHeader(who);
  // Nach dem letzten Kapitel ist der Besucher weg – das Gespräch bleibt offen, bis man das Geschenk gesehen hat
  const open = who !== null && (header !== null || outcome !== null);

  return (
    <Modal open={open} title={outcome?.title ?? header?.title ?? ""} onClose={close}>
      {outcome ? (
        <OutcomeView
          outcome={outcome}
          onDone={() => {
            setOutcome(null);
            if (outcome.finished) onClose();
          }}
        />
      ) : (
        who && header && <VisitorBody who={who} onOutcome={setOutcome} onClose={close} />
      )}
    </Modal>
  );
}

function useVisitorHeader(who: VisitorKind | null): { title: string } | null {
  const visitors = useGameStore((s) => s.visitors);
  if (who === "story" && visitors.story) {
    const def = getFixedVisitor(visitors.story.id);
    return { title: `${def.name}, ${def.role}` };
  }
  if (who === "wanderer" && visitors.wanderer) {
    const template = wandererTemplate(visitors.wanderer.kind);
    return { title: `${template.name}, ${template.role}` };
  }
  return null;
}

function VisitorBody({ who, onOutcome, onClose }: { who: VisitorKind; onOutcome: (o: VisitorOutcome) => void; onClose: () => void }) {
  const visitors = useGameStore((s) => s.visitors);
  const accept = useGameStore((s) => s.acceptVisitor);
  const dismiss = useGameStore((s) => s.dismissWanderer);
  const turnIn = useGameStore((s) => s.turnInVisitor);
  const now = useNow();

  const story = who === "story" ? visitors.story : null;
  const wanderer = who === "wanderer" ? visitors.wanderer : null;
  const def = story ? getFixedVisitor(story.id) : null;
  const quest: QuestDef = def ? chapterQuest(def, story!.chapter) : wanderer!.quest;
  const accepted = story ? story.accepted : wanderer!.accepted;
  const progress = story ? story.progress : wanderer!.progress;
  const complete = accepted && isQuestComplete(quest, progress);
  const sprite = getVisitorSprite(def ? def.id : wanderer!.kind);
  const last = def ? story!.chapter === def.chapters.length - 1 : true;
  const choice = def && last ? def.choice : undefined;

  const text = def
    ? complete
      ? def.chapters[story!.chapter].thanks
      : `${story!.chapter === 0 && !accepted ? `${def.intro}\n\n` : ""}${def.chapters[story!.chapter].story}`
    : wanderer!.intro;
  const give = (choiceId?: string) => {
    const result = turnIn(who, choiceId);
    if (result) onOutcome(result);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <PixelSprite sprite={sprite} size={64} className="shrink-0 rounded-md border-2 border-night-700 bg-night-800 p-1" />
        <div className="min-w-0 flex-1 text-sm">
          {def && (
            <p className="text-xs text-muted">
              Kapitel {story!.chapter + 1} von {def.chapters.length}: <span className="text-parchment">{def.chapters[story!.chapter].title}</span>
            </p>
          )}
          {text.split("\n\n").map((para, i) => (
            <p key={i} className="mt-1 whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-md border-2 border-night-700 bg-night-800 p-3 text-sm">
        <p className="font-semibold">{questGoalText(quest)}</p>
        {accepted && (
          <p className={`num mt-1 ${complete ? "text-xp" : "text-muted"}`}>
            {complete ? "✓ Erfüllt" : `Fortschritt: ${progress}/${questTarget(quest)}`}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          <span className="text-xp tabular-nums">+{quest.reward.xp} XP</span>
          <Gold amount={quest.reward.gold} sign className="text-gold" />
          {wanderer && (
            <span className="text-epic">
              🎁 {giftLabel(wanderer.gift, null, wanderer.gift.kind === "recipe" && visitors.recipes.includes(wanderer.gift.foodId))}
            </span>
          )}
          {def && last && <span className="text-epic">🎁 Zum Abschied: ???</span>}
        </div>
        {wanderer && (
          <p className="mt-1 text-xs text-muted">⏳ Zieht weiter in {formatCountdown(now, new Date(wanderer.leaves))}</p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {!accepted && (
          <>
            {wanderer ? (
              <button
                onClick={() => {
                  dismiss();
                  onClose();
                }}
                className="rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-parchment"
              >
                Wegschicken
              </button>
            ) : (
              <button onClick={onClose} className="rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-parchment">
                Später
              </button>
            )}
            <ActionButton onClick={() => accept(who)}>Annehmen</ActionButton>
          </>
        )}
        {accepted && !complete && (
          <button onClick={onClose} className="rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-parchment">
            Weiter geht's
          </button>
        )}
        {complete && !choice && <ActionButton onClick={() => give()}>Abgeben</ActionButton>}
      </div>
      {complete && choice && (
        <div className="flex flex-col gap-2 border-t-2 border-night-700 pt-3">
          <p className="font-pixel text-lg text-gold">{choice.prompt}</p>
          {choice.options.map((option) => (
            <ActionButton key={option.id} onClick={() => give(option.id)}>
              {option.label}
            </ActionButton>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25"
    >
      {children}
    </motion.button>
  );
}

function OutcomeView({ outcome, onDone }: { outcome: VisitorOutcome; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {outcome.text.split("\n\n").map((para, i) => (
        <p key={i}>{para}</p>
      ))}
      <div className="rounded-md border-2 border-xp/60 bg-xp/10 p-3">
        <div className="flex flex-wrap items-center gap-x-3">
          <span className="text-xp tabular-nums">+{outcome.xp} XP</span>
          <Gold amount={outcome.gold} sign className="text-gold" />
        </div>
        {outcome.gift && <p className="mt-1 font-semibold">🎁 {giftLabel(outcome.gift, outcome, outcome.recipeKnown)}</p>}
      </div>
      <div className="flex justify-end">
        <ActionButton onClick={onDone}>{outcome.finished ? "Lebe wohl" : "Weiter"}</ActionButton>
      </div>
    </div>
  );
}

/** Ausführlicher Text für ein Geschenk – mit Namen von Item, Gericht oder Begleiter. `known`: das Rezept hat man schon. */
function giftLabel(gift: VisitorGift, outcome: VisitorOutcome | null, known: boolean) {
  switch (gift.kind) {
    case "companion":
      return `${gift.name} schliesst sich dir an – du findest ihn in der Taverne. Er belegt keinen Platz.`;
    case "unique": {
      const def = getItem(gift.itemId);
      const effect = outcome?.item ? effectOf(outcome.item, def) : null;
      return (
        <>
          <span className={RARITY_TEXT.legendary}>{def.name}</span>
          {effect && ` – ${getItemEffect(effect).name}: ${getItemEffect(effect).description}`}
        </>
      );
    }
    case "recipe": {
      const food = getFood(gift.foodId);
      return known
        ? `Rezept: ${food.name} – kennst du schon, dafür ${RECIPE_KNOWN_XP_FACTOR}× EP`
        : `Rezept: ${food.name} – ab jetzt in der Taverne`;
    }
    case "potions":
      return Object.entries(gift.potions)
        .map(([id, count]) => `${count}× ${getPotion(id).name}`)
        .join(", ");
    case "materials":
      return materialEntries(gift.materials)
        .map(({ def, count }) => `${count}× ${def.icon} ${def.name}`)
        .join(", ");
    case "loot":
      return outcome?.item ? (
        <span className={RARITY_TEXT[outcome.item.rarity]}>{getItem(outcome.item.itemId).name}</span>
      ) : (
        "ein Item, eher selten oder besser"
      );
    case "gold":
      return `${gift.gold} Gold extra`;
  }
}
