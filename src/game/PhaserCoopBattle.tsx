import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useCoopStore } from "../coop/coopStore";
import { COOP_SCENE_HEIGHT, COOP_SCENE_WIDTH, CoopBattleScene, type CoopSceneData } from "./CoopBattleScene";

/**
 * Bettet die Koop-Kampfszene in React ein – ein Spiel pro Kampf. Die Szene
 * startet mit dem aktuellen Stand und bekommt danach alles über den EventBus.
 */
export default function PhaserCoopBattle({ battleId }: { battleId: string }) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { battle, members, myId } = useCoopStore.getState();
    if (!battle || !parent.current) return;
    const data: CoopSceneData = { state: battle, members, myId };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current,
      width: COOP_SCENE_WIDTH,
      height: COOP_SCENE_HEIGHT,
      backgroundColor: "#0e0b16",
      pixelArt: true,
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add("coop-battle", CoopBattleScene, true, data);
    return () => game.destroy(true);
  }, [battleId]);

  return (
    <div
      ref={parent}
      className="aspect-[9/4] w-full overflow-hidden rounded-md border-2 border-night-700 bg-night-950"
    />
  );
}
