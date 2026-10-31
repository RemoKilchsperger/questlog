import { materialEntries, type MaterialStock } from "../domain/village";

/** Erhaltenes Baumaterial, z. B. „+1 🪵 Düsterholz“ – nichts, wenn die Belohnung keines enthält. */
export function MaterialGain({ materials, className = "" }: { materials: MaterialStock | undefined; className?: string }) {
  const entries = materialEntries(materials);
  if (entries.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap justify-center gap-x-2 text-material ${className}`}>
      {entries.map(({ def, count }) => (
        <span key={def.id} className="whitespace-nowrap">
          <span className="num">+{count}</span> {def.icon} {def.name}
        </span>
      ))}
    </span>
  );
}
