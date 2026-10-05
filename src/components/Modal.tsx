import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Modaler Dialog mit freiem Inhalt. Escape oder Klick daneben schliesst (falls `onClose`). */
export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Ohne onClose lässt sich der Dialog nicht wegklicken (z. B. Pflicht-Entscheidungen). */
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/75 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="panel w-full max-w-md border-gold p-5"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="modal-title" className="font-pixel text-2xl">
                {title}
              </h2>
              {onClose && (
                <button onClick={onClose} aria-label="Schliessen" className="text-muted hover:text-parchment">
                  ✕
                </button>
              )}
            </div>
            <div className="text-sm">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
