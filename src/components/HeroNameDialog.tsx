import { useState } from "react";
import { useCloudStore } from "../cloud/cloudStore";
import { randomLooks } from "../domain/looks";
import { useGameStore } from "../store/gameStore";
import { LooksEditor } from "./LooksEditor";
import { Modal } from "./Modal";
import { PixelAvatar } from "./PixelAvatar";

/** Pflicht-Dialog beim ersten Start: Aussehen wählen und den neuen Helden benennen. */
export function HeroNameDialog() {
  const unnamed = useGameStore((s) => s.character.named === false);
  const renameCharacter = useGameStore((s) => s.renameCharacter);
  const setLooks = useGameStore((s) => s.setLooks);
  // Nicht über die Cloud-Dialoge legen – die kommen zuerst dran
  const cloudBusy = useCloudStore((s) => s.needsUsername || s.conflict !== null);
  const [name, setName] = useState("");
  // Jeder neue Held sieht erst einmal anders aus
  const [looks, setDraft] = useState(() => randomLooks());

  return (
    <Modal open={unnamed && !cloudBusy} title="Erschaffe deinen Helden">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setLooks(looks);
          renameCharacter(name);
        }}
      >
        <p className="text-muted">
          Ein neues Abenteuer beginnt. Aussehen und Namen kannst du später im Charakterbogen ändern.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="rounded-lg bg-night-800 p-3">
            <PixelAvatar size={112} looks={looks} />
          </div>
          <LooksEditor looks={looks} onChange={setDraft} />
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="Name deines Helden"
          aria-label="Name des Helden"
          className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none focus:border-gold"
        />
        <button
          disabled={!name.trim()}
          className="font-pixel self-end rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25 disabled:opacity-40"
        >
          Abenteuer beginnen
        </button>
      </form>
    </Modal>
  );
}
