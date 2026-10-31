import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Modaler Dialog mit freiem Inhalt. Escape oder Klick daneben schliesst (falls `onClose`). */
export function Modal({
  open,
  title,
  children,
  onClose,
  wide = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Ohne onClose lässt sich der Dialog nicht wegklicken (z. B. Pflicht-Entscheidungen). */
  onClose?: () => void;
  /** Breit und scrollbar – für ganze Menüs wie Händler oder Schmied. */
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Liegt ein Dialog darüber (z. B. eine Bestätigung im Menü), schliesst Escape nur diesen.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] === dialog.current) onClose();
    };
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
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className={`panel w-full border-gold p-5 ${wide ? "max-h-[90vh] max-w-5xl overflow-y-auto" : "max-w-md"}`}
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
