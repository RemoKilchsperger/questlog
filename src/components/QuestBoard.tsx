import { AnimatePresence } from "motion/react";
import { useState, type ReactNode } from "react";
import { dateKey } from "../domain/calendar";
import { isWaiting } from "../domain/recurrence";
import { useGameStore } from "../store/gameStore";
import { QuestCard } from "./QuestCard";

type Filter = "open" | "done";

export function QuestBoard() {
  const quests = useGameStore((s) => s.quests);
  const [filter, setFilter] = useState<Filter>("open");

  const today = dateKey();
  const allOpen = quests.filter((q) => q.status === "open");
  // Wiederkehrende Quests, die für ihren Termin schon erledigt sind, kommen ans Ende
  const waiting = allOpen.filter((q) => isWaiting(q, today)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const open = allOpen.filter((q) => !isWaiting(q, today));
  const done = quests
    .filter((q) => q.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const visible = filter === "open" ? sortOpen(open) : done;

  return (
    <section className="panel flex min-h-[300px] flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-pixel text-2xl">Questlog</h2>
        <div className="flex rounded-md bg-night-950 p-1 text-sm">
          <FilterButton active={filter === "open"} onClick={() => setFilter("open")}>
            Offen ({open.length})
          </FilterButton>
          <FilterButton active={filter === "done"} onClick={() => setFilter("done")}>
            Erledigt ({done.length})
          </FilterButton>
        </div>
      </div>

      {visible.length === 0 && !(filter === "open" && waiting.length > 0) ? (
        <p className="m-auto max-w-xs text-center text-muted">
          {filter === "open"
            ? "Keine offenen Quests. Nimm links eine neue Quest an!"
            : "Noch keine Quest abgeschlossen."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visible.map((q) => (
              <QuestCard key={q.id} quest={q} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {filter === "open" && waiting.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 text-xs uppercase tracking-wide text-muted">🔁 Für heute erledigt ({waiting.length})</h3>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {waiting.map((q) => (
                <QuestCard key={q.id} quest={q} />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </section>
  );
}

/** Fällige zuerst, dann neueste. */
function sortOpen<T extends { dueDate?: string; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-3 py-1 transition ${active ? "bg-night-700 text-parchment" : "text-muted hover:text-parchment"}`}
    >
      {children}
    </button>
  );
}
