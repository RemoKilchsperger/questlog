import { getLevelProgress, unspentPoints } from "../domain/leveling";
import { useGameStore } from "../store/gameStore";
import { Essence, Gold } from "./Gold";
import { CloudButton } from "./CloudAccount";
import { Hint } from "./HoverCard";
import { PixelAvatar } from "./PixelAvatar";
import { AvatarFrame } from "./Achievements";
import { XpBar } from "./XpBar";

/** Kompakte Statusleiste oben – immer sichtbar wie ein Spiel-HUD. */
export function Hud({ onOpenCharacter }: { onOpenCharacter: () => void }) {
  const character = useGameStore((s) => s.character);
  const frame = useGameStore((s) => s.cosmetics.frame);
  const { level } = getLevelProgress(character.totalXp);
  const unspent = unspentPoints(character);

  return (
    <header className="panel flex items-center gap-3 p-3 sm:gap-4">
      <button
        onClick={onOpenCharacter}
        className="relative shrink-0 rounded-md bg-night-800 p-1 ring-gold/60 hover:ring-2"
        aria-label={unspent > 0 ? `Charakter öffnen – ${unspent} Attributpunkte zu verteilen` : "Charakter öffnen"}
      >
        <AvatarFrame frame={frame} className="rounded">
          <PixelAvatar size={44} />
        </AvatarFrame>
        {unspent > 0 && (
          <Hint text={`${unspent} Attributpunkte zu verteilen – im Charakter-Tab.`} className="absolute -right-2 -top-2 inline-flex">
            <span className="num rounded-full border-2 border-night-900 bg-xp px-1.5 text-xs leading-4 text-night-950">
              +{unspent}
            </span>
          </Hint>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-pixel truncate text-xl">{character.name}</h1>
          <span className="font-pixel shrink-0 text-gold">
            Lv. <span className="num">{level}</span>
          </span>
        </div>
        <XpBar totalXp={character.totalXp} size="sm" />
      </div>
      <div className="shrink-0 rounded-md bg-night-800 px-3 py-2 text-gold">
        <Gold amount={character.gold} className="font-bold" />
      </div>
      {character.essence > 0 && (
        <Hint heading="Essenz" text="Gewinnst du beim Schmied, wenn du Items zerlegst. Damit verbesserst du deine Ausrüstung.">
          <div className="rounded-md bg-night-800 px-3 py-2 text-essence">
            <Essence amount={character.essence} className="font-bold" />
          </div>
        </Hint>
      )}
      <CloudButton />
    </header>
  );
}
