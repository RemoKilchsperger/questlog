import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { getCreature } from "../domain/creatures";
import { useGameStore } from "../store/gameStore";
import { BattleScene, SCENE_HEIGHT, SCENE_WIDTH, type BattleSceneData } from "./BattleScene";
import { getHeroGlowSprite, getHeroSprite, getMainWeapon, getMainWeaponGlow } from "./heroSprite";

/**
 * Bettet die Phaser-Kampfszene in React ein. Pro Kampf wird ein Spiel
 * erstellt und beim Verlassen wieder abgebaut. Die Szene startet mit dem
 * aktuellen Kampfstand und bekommt danach alles über den EventBus.
 */
export default function PhaserBattle({ battleId }: { battleId: string }) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { battle, equipment } = useGameStore.getState();
    if (!battle || !parent.current) return;
    const { creature, area } = getCreature(battle.creatureId);
    const data: BattleSceneData = {
      battle,
      heroSprite: getHeroSprite(equipment, { withoutMainWeapon: true }),
      heroWeapon: getMainWeapon(equipment),
      heroGlow: getHeroGlowSprite(equipment, { withoutMainWeapon: true }),
      heroWeaponGlow: getMainWeaponGlow(equipment),
      enemySprite: creature.sprite,
      boss: creature.boss,
      colors: area.colors,
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current,
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      backgroundColor: "#0e0b16",
      pixelArt: true,
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add("battle", BattleScene, true, data);
    return () => game.destroy(true);
  }, [battleId]);

  return (
    <div
      ref={parent}
      className="aspect-[9/4] w-full overflow-hidden rounded-md border-2 border-night-700 bg-night-950"
    />
  );
}
