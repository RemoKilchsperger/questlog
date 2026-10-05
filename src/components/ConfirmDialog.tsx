import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Modaler Bestätigungsdialog. Escape oder Klick daneben bricht ab. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/75 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="panel w-full max-w-sm border-gold p-5"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="font-pixel mb-3 text-2xl">
              {title}
            </h2>
            <div className="text-sm">{children}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-md border-2 border-night-700 px-3 py-1 text-muted hover:text-parchment"
              >
                Abbrechen
              </button>
              <button
                autoFocus
                onClick={onConfirm}
                className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
