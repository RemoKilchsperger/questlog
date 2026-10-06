const numberFormat = new Intl.NumberFormat("de-CH");

/** 1250 → "1’250" */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/**
 * Einheitliche Gold-Anzeige. Bewusst nicht in der Pixelschrift, weil dort
 * z. B. „8“ und „S“ kaum zu unterscheiden sind.
 */
export function Gold({ amount, sign = false, className = "" }: { amount: number; sign?: boolean; className?: string }) {
  return (
    <span className={`font-sans whitespace-nowrap tabular-nums ${className}`}>
      {sign && amount >= 0 ? "+" : ""}
      {formatNumber(amount)} <span aria-label="Gold">🪙</span>
    </span>
  );
}

/** Essenz aus zerlegten Items – Gegenstück zur Gold-Anzeige. */
export function Essence({ amount, sign = false, className = "" }: { amount: number; sign?: boolean; className?: string }) {
  return (
    <span className={`font-sans whitespace-nowrap tabular-nums ${className}`}>
      {sign && amount >= 0 ? "+" : ""}
      {formatNumber(amount)} <span aria-label="Essenz">💠</span>
    </span>
  );
}
