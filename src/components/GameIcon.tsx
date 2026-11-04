import { iconImage } from "./iconText";

/**
 * Ein Icon der Oberfläche: das Pixelbild aus iconSprites.ts (sonst das Emoji).
 * Ohne `scale` wächst es mit der Schrift; mit `scale` hat es eine feste Grösse.
 * Emojis im normalen Text werden ohnehin automatisch ersetzt (src/jsx/transform.ts) –
 * GameIcon braucht es nur, wo die Grösse fest sein soll oder kein Text drumherum steht.
 */
export function GameIcon({ icon, scale, className = "" }: { icon: string; scale?: 1 | 2 | 3 | 4; className?: string }) {
  return <>{iconImage(icon, scale, className)}</>;
}
