import { AnimatePresence, motion } from "motion/react";
import { useGameStore } from "../store/gameStore";

/**
 * Einmaliger Hinweis nach der Überarbeitung des Skilltrees (Spielstand v24): Die Skillpunkte sind
 * zurückerstattet. Bleibt stehen, bis der Spieler ihn wegklickt oder zum Skilltree springt.
 */
export function SkillTreeNotice({ onOpen }: { onOpen: () => void }) {
  const show = useGameStore((s) => s.character.skillTreeNotice === true);
  const dismiss = useGameStore((s) => s.dismissSkillTreeNotice);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {show && (
          <motion.div
            key="skill-tree-notice"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            role="status"
            className="panel pointer-events-auto flex max-w-md items-center gap-3 border-xp px-4 py-3"
          >
            <span className="text-2xl" aria-hidden>
              🌳
            </span>
            <span className="flex-1 text-sm">
              <span className="font-semibold text-xp">Klassen und Talente</span>
              <br />
              Der Skilltree wurde überarbeitet – deine Skillpunkte sind zurück.
            </span>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  dismiss();
                  onOpen();
                }}
                className="rounded-md border-2 border-xp bg-xp/15 px-3 py-1 text-sm text-xp hover:bg-xp/25"
              >
                Zum Skilltree
              </button>
              <button onClick={dismiss} className="text-xs text-muted hover:text-parchment">
                Später
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
