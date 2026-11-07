// Phaser-Kampfszene: zeigt Held und Kreatur, Lebensbalken und animiert die
// Ereignisse, die der Store über den EventBus schickt. Die Szene rechnet
// selbst nichts aus – alle Werte kommen aus der Domain (src/domain/combat.ts).

import Phaser from "phaser";
import { getAbility, type AbilityId } from "../domain/abilities";
import { getBossAbilityById } from "../domain/bossAbilities";
import { RAGE_MAX, STATIC_MAX } from "../domain/bossIntents";
import { ADD_SKILLS, getBossPhase, RITUAL_ROUNDS, SHIELD_EVERY } from "../domain/bossMechanics";
import { bossTurnOf, type BattleEvent, type BattleState, type Side } from "../domain/combat";
import { getCreature } from "../domain/creatures";
import { getPotion } from "../domain/potions";
import { getRare, type RareLook } from "../domain/rares";
import { BG_HEIGHT, BG_SCALE, BG_WIDTH, hasBackground, paintBackground } from "./backgrounds";
import * as fx from "./battleEffects";
import { iconText } from "./phaserIcons";
import { creatureImage, lastOpaqueRow } from "./creatureImages";
import { getCreatureSprite } from "./creatureSprites";
import { EventBus } from "./EventBus";
import { music } from "./music";
import { sfx } from "./sfx";
import type { HeldWeapon } from "./heroSprite";
import { paintSprite, renderSprite, type PixelImage, type SpriteDef } from "./sprites";

export const SCENE_WIDTH = 720;
export const SCENE_HEIGHT = 320;

/**
 * Färbt ein Bild ein: Helligkeit des Pixels mal Zielfarbe (`k` hellt auf) – so bleiben
 * die Details der Zeichnung erhalten, egal welche Farbe die Grundkreatur hat.
 */
function colorize(m: Phaser.FX.ColorMatrix, color: number, k = 1.4) {
  const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((c) => (c / 255) * k);
  const row = (c: number) => [0.3 * c, 0.59 * c, 0.11 * c, 0, 0];
  m.set([...row(r), ...row(g), ...row(b), 0, 0, 0, 1, 0]);
}

/** Farbvarianten seltener Gegner (rares.ts) – ein Farbfilter auf dem Bild der Grundkreatur. */
const RARE_LOOKS: Record<RareLook, (m: Phaser.FX.ColorMatrix) => void> = {
  silver: (m) => m.grayscale(1).brightness(1.35, true),
  gold: (m) => m.sepia().saturate(0.8, true).brightness(1.25, true),
  shadow: (m) => m.grayscale(1).brightness(0.55, true),
  crimson: (m) => colorize(m, 0xff5a4a),
  frost: (m) => colorize(m, 0x9fd8ff, 1.5),
  jade: (m) => colorize(m, 0x6ae08a),
  amethyst: (m) => colorize(m, 0xc38aff, 1.5),
};

export interface BattleSceneData {
  battle: BattleState;
  /** Held mit seiner aktuellen Ausrüstung, ohne die Hauptwaffe (heroSprite.ts) */
  heroSprite: SpriteDef;
  /** Hauptwaffe – eigenes Bild, damit sie beim Angriff schwingen kann */
  heroWeapon: HeldWeapon | null;
  /** Leuchtschicht der Boss-Items am Helden (ohne Hauptwaffe) – null, wenn nichts leuchtet */
  heroGlow: SpriteDef | null;
  /** Leuchtfarbe der Hauptwaffe, falls sie ein Boss-Item ist */
  heroWeaponGlow: string | null;
  /** Schlüssel der Kreaturen-Grafik (creatureSprites.ts) */
  enemySprite: string;
  boss: boolean;
  colors: { sky: number; ground: number };
  /** Gebiet bzw. Dungeon – bestimmt den gemalten Hintergrund (backgrounds.ts) */
  areaId: string;
  /** Klick auf einen Gegner: Begleiter (uid) oder Boss (undefined) als Ziel wählen */
  selectTarget: (target: string | undefined) => void;
}

const FONT = '"Pixelify Sans", monospace';
/** Zahlen in einer gut lesbaren Schrift – in der Pixelschrift sehen 5/S und 8/S gleich aus. */
const NUMBER_FONT = '"Inter", sans-serif';
const GROUND_Y = 250;
const HERO_X = 190;
const ENEMY_X = 530;
const BAR_WIDTH = 160;
/** Lebensbalken weit oben, damit grosse Gegner darunter Platz haben */
const BAR_Y = 34;
/** Grössen: Held etwas kleiner, Gegner-Bilder grösser, Bosse am grössten */
/** Held im 24er-Raster – ganzzahlig, damit alle Pixel gleich gross sind */
const HERO_SCALE = 4;
const ENEMY_IMAGE_SCALE = 1.3;
const BOSS_IMAGE_SCALE = 1.55;
/** Begleiter des Bosses: kleiner, abwechselnd vor und hinter ihm */
const ADD_X = [410, 655];
const ADD_IMAGE_SCALE = 0.95;
const ADD_SPRITE_SCALE = 6;
const ADD_BAR_WIDTH = 90;
/** Kleinere Lebensbalken tiefer, unter dem des Bosses */
const ADD_BAR_Y = 112;

/** Grafik eines Begleiters (creatureSprites.ts / creatureImages.ts). */
const addSprite = (creatureId: string) => getCreature(creatureId).creature.sprite;

/** Pfeil für Bogenschüsse: Federn links, Spitze rechts. */
const ARROW_SPRITE: SpriteDef = {
  grid: ["tt....L.", ".hhhhhLL", "tt....L."],
  palette: { t: "#e8e1d4", h: "#8a5a2b", L: "#d0d4db" },
};

interface Fighter {
  /** Figur samt Waffe – wird bewegt, gedreht und ausgeblendet */
  body: Phaser.GameObjects.Container;
  /** Alle Bilder der Figur (für Einfärbungen, die Container nicht können) */
  images: Phaser.GameObjects.Image[];
  weapon: Phaser.GameObjects.Image | null;
  bar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  homeX: number;
  barWidth: number;
  barY: number;
  /** Stand-Position am Boden */
  groundY?: number;
  /** Atem-Animation – wird bei Sprüngen pausiert */
  breath?: Phaser.Tweens.Tween;
}

export class BattleScene extends Phaser.Scene {
  private setup!: BattleSceneData;
  /** "hero", "enemy" (der Boss) und die Begleiter unter ihrer uid */
  private fighters!: Record<string, Fighter>;
  /** Pfeil über dem gewählten Ziel – nur, wenn Begleiter mitkämpfen */
  private targetMarker: Phaser.GameObjects.Text | null = null;
  /** Kuppel von Bollwerk – bleibt sichtbar, bis sie einen Angriff blockt */
  private bulwark: Phaser.GameObjects.Graphics | null = null;
  /** Eissplitter schweben ab der Ankündigung über dem Helden, bis sie losfliegen */
  private iceShards: fx.IceShards | null = null;
  /** Dauerhafte Zeichen des Zustands (applyLooks): Farbschicht über der Figur, solange er anhält */
  private looks: Record<string, { overlay: Phaser.GameObjects.Image; pulse: Phaser.Tweens.Tween | null; key: string }> = {};
  /** Schild des Schildträgers über dem Boss */
  private bossShield: Phaser.GameObjects.Graphics | null = null;
  /** Grösse des Bosses beim Aufbau – Wut und Lidschlag verändern sie relativ dazu */
  private bossScale: number | null = null;
  /** Wie weit der Boss gerade gehoben (negativ) bzw. abgetaucht (positiv) ist */
  private bossLift = 0;
  /** Noten über dem Trommler – je lauter, desto öfter */
  private drumNotes: Record<string, { stacks: number; timer: Phaser.Time.TimerEvent }> = {};

  constructor() {
    super("battle");
  }

  init(data: BattleSceneData) {
    this.setup = data;
  }

  /** Gegner mit eigenem Bild (creatureImages.ts) vorab laden. */
  preload() {
    const sprites = [this.setup.enemySprite, ...(this.setup.battle.adds ?? []).map((a) => addSprite(a.creatureId))];
    for (const sprite of new Set(sprites)) {
      const url = creatureImage(sprite);
      const key = `creature-img-${sprite}`;
      if (url && !this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create() {
    const { battle, colors } = this.setup;
    this.drawBackground(colors, this.setup.areaId);

    const hero = this.addBody(HERO_X, "hero", this.setup.heroSprite, HERO_SCALE, this.setup.heroWeapon);
    const enemyScale = this.setup.boss ? 9.5 : 8;
    const enemyImage = `creature-img-${this.setup.enemySprite}`;
    const enemy = this.textures.exists(enemyImage)
      ? this.addImageBody(ENEMY_X, enemyImage, this.setup.boss ? BOSS_IMAGE_SCALE : ENEMY_IMAGE_SCALE)
      : this.addBody(ENEMY_X, `creature-${this.setup.enemySprite}`, getCreatureSprite(this.setup.enemySprite), enemyScale);

    this.addHeroGlow(hero);

    this.fighters = {
      hero: this.createFighter(hero, battle.hero.name, battle.hero.level, battle.hero.hp, battle.hero.maxHp),
      enemy: this.createFighter(
        enemy,
        battle.rare ? `✦ ${battle.enemy.name}` : battle.elite ? `★ ${battle.enemy.name}` : battle.enemy.name,
        battle.enemy.level,
        battle.enemy.hp,
        battle.enemy.maxHp,
      ),
    };
    // Seltene Gegner in ihrer eigenen Farbe mit violettem Schimmer, Elite-Gegner leuchten golden
    if (battle.elite) {
      const look = battle.rare ? RARE_LOOKS[getRare(battle.rare).look] : null;
      for (const image of enemy.images) {
        if (!image.preFX) continue;
        image.preFX.padding = 8;
        if (look) look(image.preFX.addColorMatrix());
        image.preFX.addGlow(look ? 0xb57af0 : 0xf4c95d, 4, 0, false, 0.1, 12);
      }
    }
    // Begleiter: kleiner, der erste vor dem Boss, der zweite dahinter
    (battle.adds ?? []).forEach((add, i) => {
      const sprite = addSprite(add.creatureId);
      const x = ADD_X[i % ADD_X.length];
      const image = `creature-img-${sprite}`;
      const parts = this.textures.exists(image)
        ? this.addImageBody(x, image, ADD_IMAGE_SCALE)
        : this.addBody(x, `creature-${sprite}`, getCreatureSprite(sprite), ADD_SPRITE_SCALE);
      parts.body.setDepth(i % 2 === 0 ? 2 : -0.5);
      const { name, level, hp, maxHp } = add.combatant;
      // Begleiter mit Rolle tragen ihr Zeichen vor dem Namen (💚 Heiler, 🛡️ Schildträger, 🥁 Trommler)
      const label = add.role ? `${ADD_SKILLS[add.role].icon} ${name}` : name;
      this.fighters[add.uid] = this.createFighter(parts, label, level, hp, maxHp, true);
    });
    if (battle.adds?.length) this.enableTargeting(battle);

    // Leichtes Atmen, damit die Szene lebt.
    for (const f of Object.values(this.fighters)) {
      f.groundY = f.body.y;
      if (f.hp === 0) continue;
      f.breath = this.tweens.add({
        targets: f.body,
        y: f.body.y - 4,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    for (const add of battle.adds ?? []) if (add.combatant.hp === 0) this.showAddDefeat(add.uid, true);
    if (battle.status === "won") this.showDefeat("enemy", true);
    if (battle.status === "lost") this.showDefeat("hero", true);
    if (battle.status === "fled") this.showFlight(true);

    const off = EventBus.on("battle:events", ({ battle: next, events }) => {
      if (next.id === this.setup.battle.id) this.play(events, next);
    });
    const offTarget = EventBus.on("battle:target", ({ battleId, target }) => {
      if (battleId === this.setup.battle.id) this.markTarget(target);
    });
    for (const event of [Phaser.Scenes.Events.SHUTDOWN, Phaser.Scenes.Events.DESTROY]) {
      this.events.once(event, off);
      this.events.once(event, offTarget);
    }

    this.applyLooks(battle);

    if (battle.status === "active") {
      music.start(this.setup.boss, this);
      const stopMusic = () => music.stop(this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopMusic);
      this.events.once(Phaser.Scenes.Events.DESTROY, stopMusic);
    }
  }

  /** Gemalter Pixel-Hintergrund des Gebiets – ohne einen nur Himmel- und Bodenfarbe. */
  private drawBackground(colors: BattleSceneData["colors"], areaId: string) {
    const g = this.add.graphics();
    if (hasBackground(areaId)) {
      const key = `bg-${areaId}`;
      if (!this.textures.exists(key)) {
        const canvas = this.textures.createCanvas(key, BG_WIDTH, BG_HEIGHT)!;
        paintBackground(canvas.getContext(), areaId);
        canvas.refresh();
      }
      this.add.image(0, 0, key).setOrigin(0).setScale(BG_SCALE).setDepth(-1);
    } else {
      g.fillStyle(colors.sky).fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
      g.fillStyle(colors.ground).fillRect(0, GROUND_Y - 10, SCENE_WIDTH, SCENE_HEIGHT - GROUND_Y + 10);
    }
    // Schatten unter den Kämpfern
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(HERO_X, GROUND_Y + 2, 90, 16);
    g.fillEllipse(ENEMY_X, GROUND_Y + 2, this.setup.boss ? 140 : 110, 18);
    (this.setup.battle.adds ?? []).forEach((_, i) => g.fillEllipse(ADD_X[i % ADD_X.length], GROUND_Y + 2, 80, 14));
  }

  /**
   * Gegner anklicken wählt das Ziel – ein Pfeil zeigt, wen der Held angreift.
   * Nur, wenn Begleiter mitkämpfen; sonst gibt es nichts zu wählen.
   */
  private enableTargeting(battle: BattleState) {
    for (const key of ["enemy", ...(battle.adds ?? []).map((a) => a.uid)]) {
      const f = this.fighters[key];
      const figure = f.images[0];
      figure.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        if (f.hp > 0) this.setup.selectTarget(key === "enemy" ? undefined : key);
      });
    }
    this.targetMarker = this.add
      .text(0, 0, "▼", { fontFamily: NUMBER_FONT, fontSize: "22px", color: "#f4c95d" })
      .setOrigin(0.5, 1)
      .setStroke("#0e0b16", 4)
      .setDepth(5);
    this.tweens.add({ targets: this.targetMarker, alpha: 0.45, duration: 600, yoyo: true, repeat: -1 });
    this.markTarget(battle.target);
  }

  /** Pfeil über das gewählte Ziel setzen (undefined = Boss). */
  private markTarget(target: string | undefined) {
    if (!this.targetMarker) return;
    const f = this.fighters[target ?? "enemy"];
    this.targetMarker.setPosition(f.homeX, Math.max(f.barY + 48, f.images[0].getBounds().top - 4));
  }

  /** Erzeugt die Textur (mit Umriss), falls es sie noch nicht gibt. */
  private makeTexture(key: string, sprite: SpriteDef): PixelImage {
    const image = renderSprite(sprite);
    if (!this.textures.exists(key)) {
      const canvas = this.textures.createCanvas(key, image.width, image.height)!;
      paintSprite(canvas.getContext(), image);
      canvas.refresh();
    }
    return image;
  }

  /**
   * Stellt die Figur so auf den Boden, dass ihre unterste sichtbare
   * Pixelzeile den Boden berührt. Eine Waffe kommt hinter den Körper, mit dem
   * Drehpunkt am Griff, genau unter die Hand.
   */
  private addBody(
    x: number,
    key: string,
    sprite: SpriteDef,
    scale: number,
    held: HeldWeapon | null = null,
  ): Pick<Fighter, "body" | "images" | "weapon"> {
    const image = this.makeTexture(key, sprite);
    let lastRow = image.height - 1;
    while (lastRow > 0 && !image.pixels[lastRow].some(Boolean)) lastRow--;
    const figure = this.add.image(0, 0, key).setOrigin(0.5, (lastRow + 1) / image.height);

    let weapon: Phaser.GameObjects.Image | null = null;
    if (held) {
      const weaponImage = this.makeTexture(`${key}-weapon`, held.sprite);
      // +1 wegen des Umrisses, + halber Block für die Mitte der Hand
      const handX = held.hand.x + 1 + held.pixel / 2 - image.width / 2;
      const handY = held.hand.y + 1 + held.pixel / 2 - (lastRow + 1);
      weapon = this.add
        .image(handX, handY, `${key}-weapon`)
        .setOrigin((held.grip.x + 1 + held.pixel / 2) / weaponImage.width, (held.grip.y + 1 + held.pixel / 2) / weaponImage.height);
    }

    // Waffen vor dem Körper – die Hand scheint durch die freie Griffstelle (wie in heroSprite.ts)
    const images = weapon ? [figure, weapon] : [figure];
    const body = this.add.container(x, GROUND_Y + 4, images).setScale(scale);
    return { body, images, weapon };
  }

  /**
   * Boss-Items leuchten in ihren Rüstungsfarben: ein weicher Schein hinter dem
   * Helden, ein pulsierender Schimmer darüber und ein Glühen um die Hauptwaffe.
   * Die Effekte (preFX) gibt es nur mit WebGL – im Canvas-Modus bleibt der Schimmer.
   */
  /** Wie addBody, aber für ein geladenes Bild: unterste sichtbare Zeile auf den Boden. */
  private addImageBody(x: number, key: string, scale: number): Pick<Fighter, "body" | "images" | "weapon"> {
    const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const figure = this.add.image(0, 0, key).setOrigin(0.5, (lastOpaqueRow(source) + 1) / source.height);
    const body = this.add.container(x, GROUND_Y + 4, [figure]).setScale(scale);
    return { body, images: [figure], weapon: null };
  }

  private addHeroGlow(hero: Pick<Fighter, "body" | "images" | "weapon">) {
    const { heroGlow, heroWeaponGlow } = this.setup;
    if (heroWeaponGlow && hero.weapon?.preFX) {
      hero.weapon.preFX.padding = 4;
      hero.weapon.preFX.addGlow(Phaser.Display.Color.HexStringToColor(heroWeaponGlow).color, 3, 0, false, 0.1, 10);
    }
    if (!heroGlow) return;
    const figure = hero.images.find((image) => image !== hero.weapon)!;
    const image = renderSprite(heroGlow, false, 1);
    if (!this.textures.exists("hero-glow")) {
      const canvas = this.textures.createCanvas("hero-glow", image.width, image.height)!;
      paintSprite(canvas.getContext(), image);
      canvas.refresh();
    }
    const halo = this.add.image(0, 0, "hero-glow").setOrigin(figure.originX, figure.originY).setAlpha(0.6);
    if (halo.preFX) {
      halo.preFX.padding = 12;
      halo.preFX.addBlur(2, 2, 2, 2, 0xffffff, 8);
    }
    const shimmer = this.add
      .image(0, 0, "hero-glow")
      .setOrigin(figure.originX, figure.originY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    hero.body.addAt(halo, 0);
    hero.body.add(shimmer);
    this.tweens.add({ targets: halo, alpha: 1, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: shimmer, alpha: 0.4, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** Figur mit Name und Lebensbalken – `small` für Begleiter (schmaler, tiefer). */
  private createFighter(
    parts: Pick<Fighter, "body" | "images" | "weapon">,
    name: string,
    level: number,
    hp: number,
    maxHp: number,
    small = false,
  ): Fighter {
    const x = parts.body.x;
    const barY = small ? ADD_BAR_Y : BAR_Y;
    iconText(
      this,
      x,
      barY - 28,
      small ? name : `${name} · Lv. ${level}`,
      { fontFamily: NUMBER_FONT, fontSize: small ? "13px" : "17px", fontStyle: "bold", color: "#efe6d2" },
      { color: "#0e0b16", width: 4 },
      0,
    );
    const bar = this.add.graphics();
    const hpText = this.add
      .text(x, barY + 14, "", { fontFamily: NUMBER_FONT, fontSize: small ? "11px" : "14px", fontStyle: "bold", color: "#efe6d2" })
      .setOrigin(0.5, 0)
      .setStroke("#0e0b16", 3);
    const barWidth = small ? ADD_BAR_WIDTH : BAR_WIDTH;
    const fighter: Fighter = { ...parts, bar, hpText, hp, maxHp, homeX: x, barWidth, barY };
    this.drawBar(fighter, hp);
    return fighter;
  }

  private drawBar(f: Fighter, hp: number) {
    const ratio = Phaser.Math.Clamp(hp / f.maxHp, 0, 1);
    const color = ratio > 0.5 ? 0x7dd3a8 : ratio > 0.25 ? 0xf4c95d : 0xf0776a;
    const x = f.homeX - f.barWidth / 2;
    f.bar.clear();
    f.bar.fillStyle(0x0e0b16).fillRect(x - 3, f.barY - 3, f.barWidth + 6, 16);
    f.bar.fillStyle(0x2e2640).fillRect(x, f.barY, f.barWidth, 10);
    f.bar.fillStyle(color).fillRect(x, f.barY, Math.round(f.barWidth * ratio), 10);
    f.hpText.setText(`${Math.round(hp)} / ${f.maxHp} LP`);
  }

  /** Lebensbalken weich auf den neuen Wert bringen. */
  private setHp(side: string, hp: number) {
    const f = this.fighters[side];
    const from = { value: f.hp };
    f.hp = hp;
    this.tweens.add({
      targets: from,
      value: hp,
      duration: 350,
      ease: "Cubic.easeOut",
      onUpdate: () => this.drawBar(f, from.value),
    });
  }

  /**
   * Spielt die Ereignisse nacheinander ab und meldet sich danach bei React.
   * Nach "ability"/"bossAbility" werden die folgenden Treffer dieser Seite im
   * Stil der Fähigkeit gezeigt (Geschoss, Strahl, Sprung …).
   */
  private play(events: BattleEvent[], next: BattleState) {
    let delay = 0;
    let heroAbility: AbilityId | null = null;
    let bossAbility: string | null = null;
    /** Erstes Ziel einer Flächen-Fähigkeit – Treffer auf die übrigen laufen nur kurz mit */
    let mainTarget: string | null = null;
    for (const event of events) {
      if (event.type === "ability") {
        heroAbility = event.ability;
        mainTarget = null;
      }
      if (event.type === "bossAbility") bossAbility = event.abilityId;
      // Xal'Zar schlägt mit der verschlungenen Fähigkeit zu – im Stil seines Leerenschlunds
      if (event.type === "stolen") bossAbility = "void-lord";
      // Begleiter setzen keine Boss-Fähigkeiten ein
      const special =
        event.type === "hit" ? (event.attacker === "hero" ? heroAbility : event.add ? null : bossAbility) : null;
      const aoe = heroAbility ? getAbility(heroAbility).aoe : undefined;
      const sideHit =
        event.type === "hit" &&
        event.attacker === "hero" &&
        (aoe === "all" || typeof aoe === "object") &&
        (mainTarget ??= event.add ?? "enemy") !== (event.add ?? "enemy");
      this.time.delayedCall(delay, () => (sideHit ? this.sideImpact(event) : this.animate(event, special)));
      delay +=
        event.type === "defeated" || event.type === "fled"
          ? event.type === "defeated" && event.add
            ? 450
            : 900
          : event.type === "bossPhase" || event.type === "explosion"
            ? 1100
            : event.type === "ability" || event.type === "bossAbility" || event.type === "stolen" || event.type === "risen" || event.type === "devoured" || event.type === "thrown"
            ? 600
            : event.type === "immune" || event.type === "drumming" || event.type === "ritual" || event.type === "static" || event.type === "evaded"
              ? 300
            : event.type === "manaBurn" || event.type === "drain" || event.type === "addHeal" || event.type === "defend" || event.type === "interrupted"
              ? 500
              : sideHit || event.type === "blocked" || (event.type === "stunned" && event.add) || event.type === "blast" || event.type === "corroded" || event.type === "smoked"
                ? 300
                : 750;
    }
    this.time.delayedCall(delay, () => {
      this.markTarget(next.target);
      this.applyLooks(next);
      EventBus.emit("battle:animation-done", { battleId: next.id });
    });
  }

  /** Nebentreffer einer Flächen-Fähigkeit: nur Einschlag und Schadenszahl, ohne eigenen Angriff. */
  private sideImpact(event: BattleEvent) {
    if (event.type !== "hit") return;
    const key = event.add ?? "enemy";
    this.impact(key, event.damage, event.crit);
    fx.burst(this, this.center(key), 0xf4c95d, 8, 40);
  }

  private animate(event: BattleEvent, special: string | null = null) {
    if (event.type === "potion") {
      const hero = this.fighters.hero;
      // Heilung grün, Angriffstrank rot, Rüstungstrank blau.
      const look = event.buff
        ? event.buff === "attack"
          ? { text: "SCHADEN ↑", color: "#f0776a", tint: 0xff9d8c }
          : { text: "RÜSTUNG ↑", color: "#7aa7f0", tint: 0xa9c6ff }
        : { text: `+${event.heal}`, color: "#7dd3a8", tint: 0x9dffc8 };
      if (event.heal > 0) this.setHp("hero", hero.hp + event.heal);
      if (event.buff) sfx.buff();
      else sfx.heal();
      this.floatText(hero.homeX, GROUND_Y - 105, look.text, look.color, 28);
      for (const image of hero.images) image.setTint(look.tint);
      this.time.delayedCall(350, () => hero.images.forEach((image) => image.clearTint()));
      this.sparkles(hero.homeX, GROUND_Y - 60, Phaser.Display.Color.HexStringToColor(look.color).color);
    } else if (event.type === "thrown") {
      // Der Wurftrank fliegt im Bogen – abgetaucht platscht er ins Wasser
      const potion = getPotion(event.potionId);
      const kind = potion.effect.kind === "throw" ? potion.effect.throw : "blast";
      const key = event.add ?? "enemy";
      sfx.whoosh(0.4);
      fx.flask(this, this.front("hero"), this.center(key), potion.icon, event.missed ? 0x7aa7f0 : fx.THROW_COLORS[kind], () => {
        if (kind === "blast") sfx.explosion();
        else if (kind === "burn") sfx.fire();
        else if (kind === "poison" || kind === "acid") sfx.poison();
        else sfx.magic();
      });
    } else if (event.type === "blast") {
      const key = event.add ?? "enemy";
      this.impact(key, event.damage, false, 0.008);
      fx.burst(this, this.center(key), fx.THROW_COLORS.blast, 12, 60);
      if (event.absorbed) this.floatText(this.fighters[key].homeX, GROUND_Y - 150, `🛡 ${event.absorbed}`, "#7aa7f0", 18);
    } else if (event.type === "corroded") {
      const key = event.add ?? "enemy";
      this.floatText(this.fighters[key].homeX, GROUND_Y - 135, "RÜSTUNG ↓", "#b8e04a", 20);
      this.tint(this.fighters[key], fx.THROW_COLORS.acid, 400);
      fx.rise(this, this.center(key), fx.THROW_COLORS.acid, 10);
    } else if (event.type === "smoked") {
      const key = event.add ?? "enemy";
      this.floatText(this.fighters[key].homeX, GROUND_Y - 135, "GESCHWÄCHT", "#a49cb8", 20);
      fx.burst(this, this.center(key), fx.THROW_COLORS.smoke, 20, 80, 10);
    } else if (event.type === "fled") {
      music.stop(this, 0.3);
      this.showFlight(false);
    } else if (event.type === "ability") {
      this.announceHeroAbility(event.ability);
    } else if (event.type === "poison") {
      const key = event.add ?? event.target;
      const target = this.fighters[key];
      this.setHp(key, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `☠ -${event.damage}`, "#7dd3a8", 24);
      sfx.poison();
      this.tint(target, 0x7dd3a8, 350);
      fx.rise(this, this.center(key), 0x7dd3a8, 8);
    } else if (event.type === "bleed") {
      const key = event.add ?? event.target;
      const target = this.fighters[key];
      this.setHp(key, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `🩸 -${event.damage}`, "#c23a3a", 24);
      sfx.bleed();
      this.tint(target, 0xc23a3a, 350);
      this.drips(target.homeX, GROUND_Y - 80);
    } else if (event.type === "burn") {
      const key = event.add ?? event.target;
      const target = this.fighters[key];
      this.setHp(key, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `🔥 -${event.damage}`, "#f08a2c", 24);
      sfx.burn();
      this.tint(target, 0xf08a2c, 350);
      fx.rise(this, this.center(key), 0xf08a2c, 10);
      fx.rise(this, this.center(key), 0xffe28f, 5, 30);
    } else if (event.type === "bossAbility") {
      this.announceBossAbility(event.abilityId);
    } else if (event.type === "blocked" && event.add) {
      // Die Kuppel hält auch die Begleiter ab – nur ein kleines Aufblitzen
      const hero = this.fighters.hero;
      this.floatText(hero.homeX, GROUND_Y - 95, "GEBLOCKT", "#7aa7f0", 20);
      fx.ring(this, { x: hero.homeX, y: GROUND_Y - 70 }, 0xa9c6ff, 80);
      sfx.block();
    } else if (event.type === "blocked") {
      const hero = this.fighters.hero;
      this.floatText(hero.homeX, GROUND_Y - 115, "GEBLOCKT!", "#7aa7f0", 28);
      sfx.block();
      this.tint(hero, 0xa9c6ff, 400);
      // Die Kuppel fängt den Schlag ab und zerspringt
      fx.burst(this, { x: hero.homeX + 60, y: GROUND_Y - 70 }, 0xa9c6ff, 18, 90);
      fx.ring(this, { x: hero.homeX, y: GROUND_Y - 70 }, 0xa9c6ff, 110);
      this.bulwark?.destroy();
      this.bulwark = null;
    } else if (event.type === "drain") {
      // Lebenskraft fliesst sichtbar vom Helden zum Gegner
      const enemy = this.fighters.enemy;
      fx.siphon(this, this.center("hero"), this.center("enemy"), 0xb0203a, 12);
      sfx.drain();
      this.time.delayedCall(400, () => {
        this.setHp("enemy", enemy.hp + event.heal);
        this.floatText(enemy.homeX, GROUND_Y - 105, `+${event.heal}`, "#b07cff", 26);
        this.tint(enemy, 0xd39bf0, 300);
      });
    } else if (event.type === "manaBurn") {
      const hero = this.fighters.hero;
      fx.siphon(this, this.center("hero"), this.center("enemy"), 0x7aa7f0, 10);
      sfx.manaBurn();
      this.floatText(hero.homeX, GROUND_Y - 105, `-${event.amount} Mana`, "#7aa7f0", 24);
    } else if (event.type === "stunned" && event.freeze) {
      const enemy = this.fighters[event.add ?? "enemy"];
      this.floatText(enemy.homeX, GROUND_Y - 120, "EINGEFROREN", "#a9e4ff", 26);
      sfx.stun();
      this.tint(enemy, 0x9fd8ff, 1100);
      fx.burst(this, this.center(event.add ?? "enemy"), 0xdff4ff, 14, 70, 5);
    } else if (event.type === "stunned") {
      const enemy = this.fighters[event.add ?? "enemy"];
      this.floatText(enemy.homeX, GROUND_Y - 120, "BETÄUBT", "#d39bf0", 26);
      sfx.stun();
      this.tweens.add({ targets: enemy.body, angle: 8, duration: 90, yoyo: true, repeat: 3 });
      fx.dizzyStars(this, { x: enemy.homeX, y: GROUND_Y - 150 });
    } else if (event.type === "defend") {
      // Abwehren: der Held hebt die Deckung
      const hero = this.fighters.hero;
      this.floatText(hero.homeX, GROUND_Y - 115, "ABWEHR", "#7aa7f0", 24);
      if (event.mana > 0) this.time.delayedCall(250, () => this.floatText(hero.homeX, GROUND_Y - 90, `+${event.mana} Mana`, "#7aa7f0", 18));
      fx.ring(this, this.center("hero"), 0xa9c6ff, 70);
      this.tint(hero, 0xa9c6ff, 350);
      sfx.block();
    } else if (event.type === "reflected") {
      // Das offene Auge wirft die Fähigkeit zurück
      const hero = this.fighters.hero;
      fx.siphon(this, this.center("enemy"), this.center("hero"), 0xd39bf0, 12);
      sfx.manaBurn();
      this.time.delayedCall(300, () => {
        this.setHp("hero", Math.max(0, hero.hp - event.damage));
        this.floatText(hero.homeX, GROUND_Y - 110, `↩ -${event.damage}`, "#d39bf0", 26);
        this.tint(hero, 0xd39bf0, 300);
      });
      this.floatText(this.fighters.enemy.homeX, GROUND_Y - 140, "ZURÜCKGEWORFEN!", "#d39bf0", 20);
    } else if (event.type === "charging") {
      const enemy = this.fighters.enemy;
      this.floatText(enemy.homeX, GROUND_Y - 130, "LÄDT AUF …", "#f4c95d", 24);
      this.tint(enemy, 0xffd27a, 600);
      fx.rise(this, this.center("enemy"), 0xf4c95d, 10);
    } else if (event.type === "interrupted") {
      const key = event.add ?? "enemy";
      this.floatText(this.fighters[key].homeX, GROUND_Y - 135, event.add ? "UNTERBROCHEN!" : "ANSTURM GEBROCHEN!", "#7dd3a8", 22);
      fx.burst(this, this.center(key), 0x7dd3a8, 10, 50);
    } else if (event.type === "staggered") {
      const enemy = this.fighters.enemy;
      this.floatText(enemy.homeX, GROUND_Y - 120, "TAUMELT", "#7dd3a8", 26);
      this.tweens.add({ targets: enemy.body, angle: 6, duration: 110, yoyo: true, repeat: 3 });
      fx.dizzyStars(this, { x: enemy.homeX, y: GROUND_Y - 150 });
    } else if (event.type === "bossShield") {
      // Der Schildträger hebt einen Schild über den Boss
      fx.siphon(this, this.center(event.add), this.center("enemy"), 0x7aa7f0, 10);
      sfx.block();
      this.time.delayedCall(350, () => {
        fx.ring(this, this.center("enemy"), 0x7aa7f0, 90, 500);
        this.floatText(this.fighters.enemy.homeX, GROUND_Y - 120, `SCHILD ${event.shield}`, "#7aa7f0", 22);
      });
    } else if (event.type === "drumming") {
      const f = this.fighters[event.add];
      this.floatText(f.homeX, GROUND_Y - 120, `♪ ×${event.stacks}`, "#f0776a", 18);
      this.tweens.add({ targets: f.body, y: f.body.y - 4, duration: 80, yoyo: true, repeat: 1 });
    } else if (event.type === "ritual") {
      const f = this.fighters[event.add];
      this.floatText(f.homeX, GROUND_Y - 120, `✦ ${event.roundsLeft}`, "#7dd3a8", 18);
      fx.rise(this, this.center(event.add), 0x7dd3a8, 5);
    } else if (event.type === "evaded") {
      this.floatText(this.fighters.enemy.homeX, GROUND_Y - 90, "INS LEERE", "#a49cb8", 22);
      fx.burst(this, { x: this.fighters.enemy.homeX, y: GROUND_Y - 10 }, 0x6fb7c8, 10, 60);
      sfx.whoosh();
    } else if (event.type === "submerged") {
      const at = { x: this.fighters.enemy.homeX, y: GROUND_Y - 10 };
      fx.ring(this, at, 0x6fb7c8, 110, 500, true);
      fx.rise(this, at, 0xbfe8f0, 10, 90);
      if (event.extinguished) this.floatText(at.x, GROUND_Y - 110, "ZISCH!", "#bfe8f0", 22);
    } else if (event.type === "platesBroken") {
      const enemy = this.fighters.enemy;
      this.floatText(enemy.homeX, GROUND_Y - 140, "PANZER BRICHT!", "#f4c95d", 24);
      fx.burst(this, this.center("enemy"), 0x8a909a, 18, 110, 8);
      sfx.quake(0.5);
    } else if (event.type === "platesRegrown") {
      const enemy = this.fighters.enemy;
      fx.ring(this, this.center("enemy"), 0x8a909a, 90, 500);
      this.tint(enemy, 0xc0c6d0, 400);
      sfx.block();
    } else if (event.type === "risen") {
      // Das Seelengefäss zerspringt, der Lich erhebt sich
      const enemy = this.fighters.enemy;
      fx.flash(this, 0x2a6a3a, 0.4, 400);
      fx.pillar(this, this.center("enemy"), 0x5dff9a);
      fx.burst(this, this.center("enemy"), 0x5dff9a, 20, 120);
      sfx.curse();
      this.time.delayedCall(300, () => {
        enemy.body.setAlpha(1).setAngle(0);
        this.setHp("enemy", event.heal);
        this.floatText(enemy.homeX, GROUND_Y - 140, "ERHEBT SICH!", "#5dff9a", 28);
      });
    } else if (event.type === "cursed") {
      fx.curseRing(this, this.center("hero"), 0x3ad6c5, () => undefined);
    } else if (event.type === "curseBroken") {
      const hero = this.fighters.hero;
      this.floatText(hero.homeX, GROUND_Y - 120, "FLUCH GEBROCHEN", "#7dd3a8", 22);
      fx.burst(this, this.center("hero"), 0x3ad6c5, 14, 80);
    } else if (event.type === "curseBurst") {
      fx.pillar(this, this.center("hero"), 0x3ad6c5);
      sfx.curse();
      this.time.delayedCall(250, () => this.impact("hero", event.damage, false, 0.012));
    } else if (event.type === "static") {
      fx.siphon(this, this.center("hero"), this.center("enemy"), 0xffe66b, 8);
      this.time.delayedCall(250, () => this.floatText(this.fighters.enemy.homeX, GROUND_Y - 130, "⚡".repeat(Math.min(event.charges, 5)), "#ffe66b", 20));
    } else if (event.type === "devoured") {
      // Die Kraft der Fähigkeit wird in den Schlund gezogen
      fx.vortex(this, this.center("hero"), [0x5a2a8a, 0x4af0ff]);
      this.time.delayedCall(200, () => fx.siphon(this, this.center("hero"), this.center("enemy"), 0x9a5ad0, 14));
      this.floatText(this.fighters.hero.homeX, GROUND_Y - 120, `${getAbility(event.ability).name} VERSCHLUNGEN`, "#c08bff", 20);
      sfx.manaBurn();
    } else if (event.type === "stolen") {
      const enemy = this.fighters.enemy;
      this.floatText(enemy.homeX, GROUND_Y - 130, `${getAbility(event.ability).name}!`, "#c08bff", 26);
      this.tint(enemy, 0x9a5ad0, 400);
      sfx.roar();
    } else if (event.type === "freed") {
      fx.siphon(this, this.center("enemy"), this.center("hero"), 0x4af0ff, 14);
      this.time.delayedCall(300, () => this.floatText(this.fighters.hero.homeX, GROUND_Y - 120, `${getAbility(event.ability).name} BEFREIT`, "#4af0ff", 20));
    } else if (event.type === "stunResisted") {
      this.floatText(this.fighters.enemy.homeX, GROUND_Y - 120, "WIDERSTEHT!", "#a49cb8", 22);
    } else if (event.type === "hit") {
      if (event.attacker === "hero") this.heroHit(event, special as AbilityId | null);
      else this.enemyHit(event, special);
      // Der Schildträger fängt einen Teil ab – blauer Schimmer um den Boss
      if (event.shielded || event.absorbed) this.time.delayedCall(150, () => fx.ring(this, this.center("enemy"), 0x7aa7f0, 75, 350));
      if (event.absorbed) {
        const absorbed = event.absorbed;
        this.time.delayedCall(200, () => this.floatText(this.fighters.enemy.homeX, GROUND_Y - 150, `🛡 ${absorbed}`, "#7aa7f0", 18));
      }
      // Schwäche oder Resistenz gegen die Waffe
      if (event.attacker === "hero" && event.matchup) {
        const f = this.fighters[event.add ?? "enemy"];
        const weak = event.matchup === "weak";
        this.time.delayedCall(200, () => this.floatText(f.homeX, GROUND_Y - 150, weak ? "SCHWACHPUNKT!" : "RESISTENT", weak ? "#7dd3a8" : "#a49cb8", 18));
      }
    } else if (event.type === "immune") {
      const f = this.fighters[event.add ?? "enemy"];
      this.floatText(f.homeX, GROUND_Y - 140, "IMMUN", "#a49cb8", 20);
    } else if (event.type === "addHeal") {
      // Lebenskraft fliesst vom Heiler zum Boss
      const enemy = this.fighters.enemy;
      fx.siphon(this, this.center(event.add), this.center("enemy"), 0x7dd3a8, 10);
      sfx.heal();
      this.time.delayedCall(350, () => {
        this.setHp("enemy", Math.min(enemy.maxHp, enemy.hp + event.heal));
        this.floatText(enemy.homeX, GROUND_Y - 105, `+${event.heal}`, "#7dd3a8", 26);
        this.tint(enemy, 0x9dffc8, 300);
      });
    } else if (event.type === "thorns") {
      const key = event.add ?? "enemy";
      const f = this.fighters[key];
      this.setHp(key, Math.max(0, f.hp - event.damage));
      this.floatText(f.homeX, GROUND_Y - 110, `🌵 -${event.damage}`, "#7dd3a8", 22);
      this.tint(f, 0x9dffc8, 200);
    } else if (event.type === "endured") {
      const hero = this.fighters.hero;
      this.setHp("hero", 1);
      this.floatText(hero.homeX, GROUND_Y - 120, "UNBEUGSAM!", "#f4c95d", 26);
      fx.ring(this, this.center("hero"), 0xf4c95d, 80);
      sfx.block();
    } else if (event.type === "secondWind") {
      const hero = this.fighters.hero;
      this.setHp("hero", event.heal);
      this.floatText(hero.homeX, GROUND_Y - 120, "ZWEITER ATEM!", "#f4c95d", 26);
      fx.pillar(this, this.center("hero"), 0xf4c95d, 60);
      sfx.heal();
    } else if (event.type === "enemyRegen") {
      const enemy = this.fighters.enemy;
      this.setHp("enemy", Math.min(enemy.maxHp, enemy.hp + event.heal));
      this.floatText(enemy.homeX, GROUND_Y - 105, `+${event.heal}`, "#7dd3a8", 24);
      fx.rise(this, this.center("enemy"), 0x7dd3a8, 8);
      sfx.heal();
    } else if (event.type === "explosion") {
      this.showExplosion(event.damage, event.blocked === true);
    } else if (event.type === "bossPhase") {
      this.showBossPhase(event.bossId, event.rally ?? []);
    } else if (event.type === "selfHeal") {
      const hero = this.fighters.hero;
      this.setHp("hero", hero.hp + event.heal);
      this.floatText(hero.homeX, GROUND_Y - 105, `+${event.heal}`, "#9dffc8", 24);
      this.sparkles(hero.homeX, GROUND_Y - 60, 0x9dffc8);
      sfx.heal();
    } else if (event.type === "guarded") {
      const hero = this.fighters.hero;
      this.floatText(hero.homeX, GROUND_Y - 120, "ABGEWEHRT", "#a9c6ff", 22);
      fx.ring(this, this.center("hero"), 0xa9c6ff, 70);
      sfx.block();
    } else if (event.type === "counter") {
      const enemy = this.fighters.enemy;
      this.setHp("enemy", Math.max(0, enemy.hp - event.damage));
      this.floatText(enemy.homeX, GROUND_Y - 110, `↺ -${event.damage}`, "#f4c95d", 26);
      fx.slashes(this, this.center("enemy"), 0xf4c95d, 2);
      this.tint(enemy, 0xffffff, 120);
      sfx.hit(true);
    } else if (event.type === "regen") {
      const hero = this.fighters.hero;
      this.setHp("hero", hero.hp + event.heal);
      this.floatText(hero.homeX, GROUND_Y - 105, `+${event.heal}`, "#9dffc8", 22);
      this.sparkles(hero.homeX, GROUND_Y - 60, 0x9dffc8);
    } else if (event.type === "defeated" && event.add) {
      this.showAddDefeat(event.add, false);
    } else if (event.type === "defeated") {
      music.stop(this, 0.3);
      this.showDefeat(event.side, false);
    }
  }

  /* ───────────── Bausteine für Treffer ───────────── */

  /** Mitte der Figur – Ziel für Geschosse, Strahlen und Effekte. */
  /**
   * Zeigt den Zustand der Gegner an ihnen selbst – ohne Worte, damit man ihn
   * selbst deuten lernt: Krummzahn läuft vor Wut rot an, das Höhlenauge glüht
   * offen und verdunkelt sich geschlossen, das Mammut bäumt sich beim Aufladen
   * auf. Heiler leuchten mit dem Ritual, Trommler schicken Noten, der Schild
   * liegt als Kuppel über dem Boss. Läuft nach jeder Runde und beim Aufbau.
   */
  private applyLooks(state: BattleState) {
    const active = state.status === "active";
    const turn = active ? bossTurnOf(state) : null;
    const boss = this.fighters.enemy;
    // Haltung: geneigt (Grad) und gestreckt/gestaucht – relativ zur Grösse beim Aufbau
    this.bossScale ??= boss.body.scaleX;
    let angle = 0;
    let grow = 1;
    let squash = 1;
    /** Höhe über dem Boden (negativ: in der Luft, positiv: abgetaucht) und Deckkraft */
    let lift = 0;
    let alpha = 1;
    if (!turn) {
      this.setLook("enemy", null);
    } else if (state.creatureId === "goblin-chief") {
      // Läuft rot an und bläht sich auf – beim Wutanfall pulsierend
      const rage = turn.rage ?? 0;
      if (turn.intent === "ability") {
        this.setLook("enemy", { color: 0xff1a0a, alpha: 0.65, pulse: 180, dark: true });
        grow = 1.12;
      } else {
        this.setLook("enemy", rage > 0 ? { color: 0xff1a0a, alpha: (0.5 * rage) / RAGE_MAX, pulse: rage >= RAGE_MAX - 1 ? 400 : 0, dark: true } : null);
        grow = 1 + (0.06 * rage) / RAGE_MAX;
      }
    } else if (state.creatureId === "cave-eye") {
      // Offen glüht es, geschlossen wird es dunkel und kneift sich zusammen
      if (turn.intent === "ability") this.setLook("enemy", { color: 0xc08bff, alpha: 0.6, pulse: 240 });
      else if (turn.eye === "open") this.setLook("enemy", { color: 0xc08bff, alpha: 0.35, pulse: 700 });
      else {
        this.setLook("enemy", { color: 0x0c0814, alpha: 0.75, dark: true });
        squash = 0.85;
      }
    } else if (turn.intent === "submerged") {
      // Abgetaucht: nur noch ein Schatten unter Wasser
      this.setLook("enemy", { color: 0x12303c, alpha: 0.6, dark: true });
      lift = 45;
      alpha = 0.35;
    } else if (turn.airborne) {
      // Hoch in der Luft, kleiner und von unten rot beschienen
      this.setLook("enemy", { color: 0xffa040, alpha: 0.18 });
      lift = -80;
      grow = 0.88;
    } else if (turn.intent === "devour") {
      // Der Schlund reisst auf – dunkel und gierig
      this.setLook("enemy", { color: 0x1a0628, alpha: 0.6, pulse: 220, dark: true });
      grow = 1.08;
    } else if (turn.intent === "stolen" || (turn.devoured && turn.intent !== "ability")) {
      // Die verschlungene Kraft flackert in ihm
      this.setLook("enemy", { color: 0x9a5ad0, alpha: 0.45, pulse: 350 });
    } else if (turn.plates !== undefined && turn.intent !== "ability") {
      // Grau gepanzert – je mehr Platten, desto stumpfer; ohne Platten glüht er verwundbar
      this.setLook("enemy", turn.plates > 0 ? { color: 0x5a606a, alpha: 0.15 * turn.plates, dark: true } : { color: 0xff8a5a, alpha: 0.3, pulse: 500 });
      squash = turn.plates > 0 ? 1 : 0.95;
    } else if ((turn.static ?? 0) > 0 && turn.intent !== "ability") {
      // Kaelthar lädt sich auf – kurz vor der Entladung flackert er
      const charges = turn.static ?? 0;
      this.setLook("enemy", { color: 0xffe66b, alpha: (0.5 * charges) / STATIC_MAX, pulse: charges >= STATIC_MAX - 1 ? 160 : 0 });
    } else if (state.creatureId === "lich-king" && turn.intent !== "ability") {
      // Das Seelengefäss leuchtet grün – je mehr Seelen, desto heller
      const vessel = turn.vessel ?? 0;
      this.setLook("enemy", vessel > 0 ? { color: 0x5dff9a, alpha: 0.08 + 0.1 * vessel, pulse: 900 } : null);
    } else if (turn.intent === "charging") {
      // Bäumt sich auf, glüht und wirbelt Schnee auf
      this.setLook("enemy", { color: 0xffd27a, alpha: 0.6, pulse: 180 });
      angle = 12;
      grow = 1.05;
      fx.rise(this, { x: boss.homeX - 40, y: GROUND_Y }, 0xd8d0c0, 14, 160);
    } else if (turn.intent === "staggered") {
      this.setLook("enemy", { color: 0x9fb4d0, alpha: 0.35 });
      angle = -8;
    } else if (turn.intent === "ability") {
      this.setLook("enemy", { color: 0xff5a3a, alpha: 0.5, pulse: 240 });
      if (state.creatureId === "primal-mammoth") angle = -6;
    } else {
      this.setLook("enemy", null);
    }
    const scaleX = this.bossScale * grow;
    const scaleY = this.bossScale * grow * squash;
    if (boss.body.angle !== angle || boss.body.scaleX !== scaleX || boss.body.scaleY !== scaleY) {
      this.tweens.add({ targets: boss.body, angle, scaleX, scaleY, duration: 300, ease: "Sine.easeOut" });
    }
    // Heben und Senken über die Teile der Figur – der Container atmet weiter
    if (lift !== this.bossLift) {
      const delta = lift - this.bossLift;
      this.bossLift = lift;
      this.tweens.add({ targets: boss.body.list, y: `+=${delta}`, duration: 450, ease: "Sine.easeInOut" });
    }
    if (active && state.enemy.hp > 0 && boss.body.alpha !== alpha) this.tweens.add({ targets: boss.body, alpha, duration: 400 });

    // Neferets Fluch liegt auf dem Helden – kurz vor dem Ausbruch pulsiert er schnell
    const curse = turn?.curse;
    this.setLook("hero", curse ? { color: 0x3ad6c5, alpha: curse.roundsLeft <= 1 ? 0.55 : 0.3, pulse: curse.roundsLeft <= 1 ? 160 : 600 } : null);

    // Schild über dem Boss
    const shield = active && state.enemy.hp > 0 ? (state.bossShield ?? 0) : 0;
    if (shield > 0 && !this.bossShield) {
      const at = this.center("enemy");
      this.bossShield = this.add.graphics().setDepth(1);
      this.bossShield.fillStyle(0x7aa7f0, 0.15).fillEllipse(at.x, at.y - 20, 300, 330);
      this.bossShield.lineStyle(4, 0xa9c6ff, 0.8).strokeEllipse(at.x, at.y - 20, 300, 330);
      this.tweens.add({ targets: this.bossShield, alpha: 0.55, duration: 900, yoyo: true, repeat: -1 });
    } else if (shield === 0 && this.bossShield) {
      fx.burst(this, this.center("enemy"), 0xa9c6ff, 14, 110);
      this.bossShield.destroy();
      this.bossShield = null;
    }

    for (const add of state.adds ?? []) {
      const alive = active && add.combatant.hp > 0;
      const cast = add.cast ?? 0;
      if (!alive || !add.role) this.setLook(add.uid, null);
      else if (add.role === "healer") this.setLook(add.uid, cast > 0 ? { color: 0x5dff9a, alpha: 0.2 * cast, pulse: cast >= RITUAL_ROUNDS - 1 ? 250 : 0 } : null);
      else if (add.role === "shield") this.setLook(add.uid, cast >= SHIELD_EVERY - 1 ? { color: 0x7aa7f0, alpha: 0.5, pulse: 260 } : null);
      else this.setLook(add.uid, cast > 0 ? { color: 0xff7a3a, alpha: 0.07 * cast } : null);
      this.setDrumNotes(add.uid, alive && add.role === "drummer" ? cast : 0);
    }
  }

  /** Farbschicht über einer Figur – `dark` verdunkelt statt aufzuhellen, `pulse` lässt sie atmen (ms). */
  private setLook(side: string, look: { color: number; alpha: number; pulse?: number; dark?: boolean } | null) {
    const f = this.fighters[side];
    if (!f) return;
    let entry = this.looks[side];
    const key = look ? `${look.color}-${look.alpha}-${look.pulse ?? 0}-${look.dark ?? false}` : "none";
    if (entry?.key === key) return;
    if (!entry) {
      if (!look) return;
      const figure = f.images[0];
      const overlay = this.add.image(figure.x, figure.y, figure.texture.key).setOrigin(figure.originX, figure.originY).setAlpha(0);
      f.body.addAt(overlay, f.body.getIndex(figure) + 1);
      entry = this.looks[side] = { overlay, pulse: null, key: "none" };
    }
    entry.key = key;
    entry.pulse?.stop();
    entry.pulse = null;
    this.tweens.killTweensOf(entry.overlay);
    if (!look) {
      this.tweens.add({ targets: entry.overlay, alpha: 0, duration: 400 });
      return;
    }
    entry.overlay.setTintFill(look.color).setBlendMode(look.dark ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: entry.overlay,
      alpha: look.alpha,
      duration: 400,
      onComplete: () => {
        if (look.pulse && entry.key === key) {
          entry.pulse = this.tweens.add({ targets: entry.overlay, alpha: look.alpha * 0.5, duration: look.pulse, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        }
      },
    });
  }

  /** Noten über dem Trommler: je mehr Wirbel, desto öfter. */
  private setDrumNotes(uid: string, stacks: number) {
    const current = this.drumNotes[uid];
    if (current?.stacks === stacks) return;
    current?.timer.remove();
    delete this.drumNotes[uid];
    if (stacks <= 0) return;
    const f = this.fighters[uid];
    const timer = this.time.addEvent({
      delay: Math.max(250, 1100 - stacks * 170),
      loop: true,
      callback: () => {
        const note = this.add
          .text(f.homeX + Phaser.Math.Between(-30, 30), GROUND_Y - 110, Math.random() < 0.5 ? "♪" : "♫", { fontFamily: NUMBER_FONT, fontSize: `${14 + stacks * 2}px`, color: "#f0a060" })
          .setOrigin(0.5)
          .setStroke("#0e0b16", 3)
          .setDepth(18);
        this.tweens.add({ targets: note, y: note.y - 50, alpha: 0, duration: 1100, onComplete: () => note.destroy() });
      },
    });
    this.drumNotes[uid] = { stacks, timer };
  }

  private center(side: string): fx.Point {
    return { x: this.fighters[side].homeX, y: GROUND_Y - 65 };
  }

  /** Vorderseite der Figur (zum Gegner hin) – Startpunkt für Geschosse. */
  private front(side: string): fx.Point {
    return { x: this.fighters[side].homeX + (side === "hero" ? 55 : -55), y: GROUND_Y - 75 };
  }

  private tint(f: Fighter, color: number, ms: number) {
    for (const image of f.images) image.setTint(color);
    this.time.delayedCall(ms, () => f.images.forEach((image) => image.clearTint()));
  }

  /** Der Treffer selbst: LP abziehen, Ziel blinkt und wackelt, Schadenszahl. */
  private impact(defenderSide: string, damage: number, crit: boolean, shake = 0) {
    const defender = this.fighters[defenderSide];
    const dir = defenderSide === "hero" ? -1 : 1;
    this.setHp(defenderSide, Math.max(0, defender.hp - damage));
    sfx.hit(crit, shake >= 0.012);
    this.tweens.add({ targets: defender.body, alpha: 0.25, duration: 70, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: defender.body, x: defender.homeX + 10 * dir, duration: 60, yoyo: true, repeat: 1 });
    if (crit || shake > 0) this.cameras.main.shake(crit ? 180 : 220, Math.max(shake, crit ? 0.01 : 0));
    if (crit) this.floatText(defender.homeX, GROUND_Y - 110, `KRITISCH! -${damage}`, "#f4c95d", 28);
    else this.floatText(defender.homeX, GROUND_Y - 100, `-${damage}`, "#f0776a", 26);
  }

  /** Ausfallschritt zum Gegner und zurück; `onHit` beim Auftreffen. */
  private lunge(side: string, onHit: () => void, distance = 90, duration = 140) {
    const f = this.fighters[side];
    const dir = side === "hero" ? 1 : -1;
    if (f.weapon) this.swing(f.weapon);
    sfx.swing();
    this.tweens.add({
      targets: f.body,
      x: f.homeX + distance * dir,
      duration,
      ease: "Quad.easeIn",
      yoyo: true,
      onYoyo: onHit,
    });
  }

  /** Sprung nach oben, dann Ausfallschritt mit Wucht nach unten. */
  private leapStrike(side: string, onHit: () => void) {
    const f = this.fighters[side];
    const baseY = f.groundY ?? f.body.y;
    const dir = side === "hero" ? 1 : -1;
    if (f.weapon) this.swing(f.weapon);
    sfx.whoosh(0.25);
    f.breath?.pause();
    this.tweens.chain({
      targets: f.body,
      tweens: [
        { y: baseY - 70, x: f.homeX + 60 * dir, duration: 180, ease: "Quad.easeOut" },
        { y: baseY, x: f.homeX + 110 * dir, duration: 130, ease: "Quad.easeIn", onComplete: onHit },
        { x: f.homeX, duration: 220, ease: "Quad.easeOut", delay: 60 },
      ],
      onComplete: () => f.breath?.resume(),
    });
  }

  /* ───────────── Fähigkeiten des Helden ───────────── */

  /** Ankündigung: Name, Aufleuchten und eine kleine Vorbereitung je nach Fähigkeit. */
  private announceHeroAbility(id: AbilityId) {
    const hero = this.fighters.hero;
    const ability = getAbility(id);
    this.floatText(hero.homeX, GROUND_Y - 125, `${ability.name}!`, "#f4c95d", 26);
    this.tint(hero, 0xffe28f, 300);
    sfx.ability();
    const at = this.center("hero");
    switch (id) {
      case "dagger": // in Rauch auflösen
        fx.burst(this, at, 0x5a3a8a, 16, 60);
        sfx.whoosh(0.2);
        this.tweens.add({ targets: hero.body, alpha: 0.15, duration: 200 });
        break;
      case "sword": // einmal um die eigene Achse wirbeln
        this.tweens.add({ targets: hero.body, angle: 360, duration: 380, onComplete: () => hero.body.setAngle(0) });
        fx.whirl(this, at);
        sfx.whoosh(0.35);
        break;
      case "greatsword": // Schwert zum Himmel, Licht sammelt sich
        fx.rise(this, at, 0xffe66b, 12, 80);
        sfx.magic();
        break;
      case "axe": // ausholen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -80, duration: 250 });
        break;
      case "greataxe":
      case "greathammer": // tief in die Knie gehen
        this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.85, duration: 200, yoyo: true });
        fx.rise(this, at, 0xf0776a, 8, 70);
        break;
      case "mace":
        fx.rise(this, at, 0xd39bf0, 8, 60);
        break;
      case "scepter": // Gift sammelt sich an der Zepterspitze
        fx.rise(this, this.front("hero"), 0x7dd3a8, 10, 30);
        break;
      case "staff": // Flammen sammeln sich
        fx.siphon(this, { x: at.x, y: at.y + 40 }, this.front("hero"), 0xf08a2c, 10);
        sfx.fire(0.3);
        break;
      case "shield": // Bollwerk: schützende Kuppel bis zum Block
        this.bulwark?.destroy();
        this.bulwark = fx.dome(this, at);
        sfx.magic();
        break;

      /* ── zweite Fähigkeiten ── */
      case "dagger-2": // Meucheln: tief ducken, die Augen blitzen rot
        this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.8, duration: 180, yoyo: true });
        fx.burst(this, { x: at.x + 12, y: at.y - 30 }, 0xff3a3a, 6, 20, 4);
        sfx.whoosh(0.15);
        break;
      case "sword-2": // Parade: Klinge quer vor den Körper
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -60, duration: 160, yoyo: true, hold: 200 });
        fx.ring(this, at, 0xdde6ff, 45, 300);
        sfx.block();
        break;
      case "greatsword-2": // Kriegsschrei: Schallwellen und Beben
        for (let i = 0; i < 3; i++) this.time.delayedCall(i * 110, () => fx.ring(this, at, 0xf08a2c, 70 + i * 30, 420));
        this.cameras.main.shake(260, 0.006);
        this.tint(hero, 0xff9a5a, 500);
        sfx.roar();
        break;
      case "axe-2": // Zerfleischen: geduckt wie ein Raubtier
        this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.85, x: hero.homeX - 12, duration: 200, yoyo: true });
        fx.rise(this, at, 0xc23a3a, 8, 50);
        sfx.whoosh(0.2);
        break;
      case "greataxe-2": // Blutrausch: rote Aura
        this.tint(hero, 0xff4a4a, 700);
        fx.rise(this, at, 0xc23a3a, 14, 70);
        fx.ring(this, at, 0xc23a3a, 60, 380);
        sfx.roar();
        break;
      case "mace-2": // Heiliges Licht: Lichtsäule über dem Helden
        fx.pillar(this, at, 0xffe9a0, 80);
        fx.rise(this, at, 0xffffff, 10, 60);
        sfx.heal();
        break;
      case "greathammer-2": // Erdbeben: Hammer hoch über den Kopf
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -110, duration: 260 });
        this.tweens.add({ targets: hero.body, y: hero.body.y - 18, duration: 200, yoyo: true });
        fx.rise(this, { x: at.x, y: GROUND_Y }, 0x8a7a60, 10, 70);
        break;
      case "scepter-2": // Fluch: dunkle Runen kreisen
        fx.curseRing(this, at, 0x8a4ad0, () => {});
        sfx.curse();
        break;
      case "staff-2": // Meteor: der Himmel glüht
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -40, duration: 220, yoyo: true, hold: 260 });
        fx.flash(this, 0x5a1408, 0.45, 500);
        fx.siphon(this, { x: at.x, y: 20 }, this.front("hero"), 0xf08a2c, 12);
        sfx.magic();
        break;
      case "bow-2": // Durchbohrender Schuss: lange zielen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, scaleX: 0.75, duration: 320, yoyo: true });
        fx.ring(this, this.center("enemy"), 0xff5a5a, 40, 500);
        sfx.whoosh(0.4);
        break;
      case "shield-2": // Vergeltung: Schild hoch, goldene Abwehrhaltung
        fx.ring(this, at, 0xf4c95d, 60);
        fx.rise(this, at, 0xf4c95d, 8, 50);
        this.tint(hero, 0xffe28f, 600);
        sfx.block();
        break;

      /* ── dritte Fähigkeiten (Zweihandwaffen) ── */
      case "greatsword-3": // Klingensturm: Klinge kreisen lassen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 360, duration: 360, onComplete: () => hero.weapon?.setAngle(0) });
        fx.whirl(this, at, 0xffc27a);
        sfx.whoosh(0.35);
        break;
      case "greataxe-3": // Enthaupten: Axt hoch über den Kopf, dunkle Aura
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -110, duration: 260 });
        fx.rise(this, at, 0x5a2a3a, 10, 60);
        sfx.whoosh(0.25);
        break;
      case "greathammer-3": // Schockwelle: Funken knistern am Hammer
        fx.rise(this, at, 0xffe66b, 10, 60);
        fx.ring(this, at, 0xffe66b, 50, 300);
        sfx.magic();
        break;
      case "staff-3": // Eisstrahl: Splitter bilden sich und schweben über dem Helden
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -30, duration: 220, yoyo: true, hold: 300 });
        this.iceShards = fx.iceShards(this, at);
        sfx.magic();
        break;
      case "bow-3": // Ausweichschuss: Sehne spannen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, scaleX: 0.8, duration: 220, yoyo: true });
        sfx.whoosh(0.2);
        break;
      case "bow": // Pfeile zum Himmel richten
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -35, duration: 220, yoyo: true, hold: 120 });
        fx.rise(this, this.front("hero"), 0xf4c95d, 8, 30);
        sfx.whoosh(0.25);
        break;

      /* ── weitere Fähigkeiten ── */
      case "dagger-3": // Giftklinge: Gift tropft von der Klinge
        fx.rise(this, this.front("hero"), 0x7dd3a8, 10, 24);
        fx.burst(this, { x: at.x + 40, y: at.y + 10 }, 0x4a9a6a, 6, 20, 4);
        sfx.poison();
        break;
      case "dagger-4": // Schattenschritt: Schatten kriechen am Helden hoch
        fx.rise(this, { x: at.x, y: at.y + 30 }, 0x2a1a3a, 14, 60);
        this.tweens.add({ targets: hero.body, alpha: 0.45, duration: 220, yoyo: true, hold: 160 });
        sfx.whoosh(0.2);
        break;
      case "sword-3": // Finte: Klinge zuckt zweimal vor
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 35, duration: 90, yoyo: true, repeat: 1 });
        this.tweens.add({ targets: hero.body, x: hero.homeX + 14, duration: 90, yoyo: true, repeat: 1 });
        sfx.whoosh(0.12);
        break;
      case "sword-4": // Entwaffnen: Klinge tief, auf die Waffenhand zielen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 50, duration: 200, yoyo: true, hold: 200 });
        fx.crosshair(this, { x: this.center("enemy").x - 20, y: this.center("enemy").y + 15 }, 0xdde6ff, 18, 250);
        break;
      case "axe-3": // Hackwirbel: Axt kreisen lassen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -360, duration: 380, onComplete: () => hero.weapon?.setAngle(0) });
        fx.whirl(this, at, 0xc8d0d8);
        sfx.whoosh(0.35);
        break;
      case "axe-4": // Ausbluten: Witterung aufnehmen, Blutstropfen glühen am Gegner
        this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.88, x: hero.homeX + 10, duration: 220, yoyo: true });
        fx.rise(this, this.center("enemy"), 0xc23a3a, 8, 50);
        fx.ring(this, this.center("enemy"), 0xc23a3a, 45, 400);
        sfx.whoosh(0.2);
        break;
      case "mace-3": // Läuterung: weisse Flammen umspielen den Helden
        fx.rise(this, at, 0xffffff, 12, 70);
        fx.ring(this, at, 0xbfe9ff, 55, 400);
        sfx.magic();
        break;
      case "mace-4": // Heiliger Hammer: Licht sammelt sich am Kolben
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -100, duration: 240 });
        fx.siphon(this, { x: at.x, y: at.y - 60 }, { x: at.x + 20, y: at.y - 40 }, 0xffe9a0, 12);
        sfx.magic();
        break;
      case "scepter-3": // Seelenfeuer: violette Flammen an der Zepterspitze
        fx.rise(this, this.front("hero"), 0xb07cff, 12, 30);
        fx.rise(this, this.front("hero"), 0x5a2a8a, 6, 20);
        sfx.fire(0.3);
        break;
      case "scepter-4": // Lebensentzug: dunkler Sog vor dem Zepter
        fx.vortex(this, this.front("hero"), [0x8a2a4a, 0x2a1a3a], 500);
        sfx.curse();
        break;
      case "shield-3": // Schildstoss: Schild vor, Anlauf nehmen
        this.tweens.add({ targets: hero.body, x: hero.homeX - 20, duration: 200, yoyo: true });
        fx.ring(this, this.front("hero"), 0xa9c6ff, 35, 280);
        break;
      case "shield-4": // Schildwall: Steinblöcke wachsen vor dem Helden
        fx.wall(this, { x: hero.homeX + 70, y: 0 }, GROUND_Y, 900);
        this.cameras.main.shake(180, 0.004);
        sfx.quake(0.3);
        break;
      case "greatsword-4": // Kreuzhieb: Klinge über die Schulter
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -120, duration: 240 });
        fx.slashes(this, at, 0xdde6ff, 1);
        fx.slashes(this, at, 0xdde6ff, 1, true);
        sfx.whoosh(0.25);
        break;
      case "greatsword-5": // Konterstellung: zurückweichen, Klinge nach vorn
        this.tweens.add({ targets: hero.body, x: hero.homeX - 22, scaleY: hero.body.scaleY * 0.92, duration: 220, yoyo: true, hold: 160 });
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 70, duration: 220, yoyo: true, hold: 160 });
        fx.ring(this, { x: at.x, y: GROUND_Y }, 0xa9c6ff, 70, 450, true);
        sfx.block();
        break;
      case "greatsword-6": // Mordschlag: die Klinge packen, Knauf nach vorn
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 180, duration: 260 });
        fx.rise(this, at, 0xc8b090, 8, 50);
        sfx.whoosh(0.2);
        break;
      case "greataxe-4": // Wirbelwind: Staub wirbelt um den Helden
        this.tweens.add({ targets: hero.body, angle: 360, duration: 360, onComplete: () => hero.body.setAngle(0) });
        fx.whirl(this, at, 0xff8a5a);
        fx.rise(this, { x: at.x, y: GROUND_Y - 10 }, 0xc8b090, 12, 90);
        sfx.whoosh(0.4);
        break;
      case "greataxe-5": // Wutschrei: brüllen, rote Schallwellen
        for (let i = 0; i < 3; i++) this.time.delayedCall(i * 100, () => fx.ring(this, at, 0xff3a3a, 60 + i * 35, 400));
        this.tweens.add({ targets: hero.body, scaleX: hero.body.scaleX * 1.12, scaleY: hero.body.scaleY * 1.12, duration: 180, yoyo: true, hold: 200 });
        this.tint(hero, 0xff3a3a, 700);
        this.cameras.main.shake(300, 0.008);
        sfx.roar();
        break;
      case "greataxe-6": // Raserei: vor Wut zittern
        this.tweens.add({ targets: hero.body, x: hero.homeX + 5, duration: 40, yoyo: true, repeat: 5 });
        this.tint(hero, 0xff6a3a, 500);
        fx.rise(this, at, 0xff6a3a, 12, 60);
        sfx.roar();
        break;
      case "greathammer-4": // Zertrümmern: Hammer hoch, Metallsplitter glänzen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -110, duration: 260 });
        fx.rise(this, at, 0xa0a8b0, 10, 60);
        sfx.whoosh(0.25);
        break;
      case "greathammer-5": // Unerschütterlich: fest in den Boden stemmen
        this.tweens.add({ targets: hero.body, y: hero.body.y + 8, duration: 160, yoyo: true, hold: 300 });
        this.cameras.main.shake(200, 0.006);
        fx.ring(this, { x: at.x, y: GROUND_Y }, 0x8a7a60, 110, 500, true);
        fx.rise(this, at, 0x9dffc8, 10, 60);
        this.tint(hero, 0xc8b090, 700);
        sfx.quake(0.3);
        this.time.delayedCall(250, () => sfx.heal());
        break;
      case "greathammer-6": // Titanenschlag: weit ausholen, Kraft staut sich
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -140, duration: 300, yoyo: true, hold: 500 });
        this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.88, duration: 300, yoyo: true, hold: 500 });
        fx.siphon(this, { x: at.x, y: at.y - 20 }, { x: at.x - 10, y: at.y - 70 }, 0xffb060, 16);
        this.time.delayedCall(350, () => fx.ring(this, { x: at.x - 10, y: at.y - 70 }, 0xffb060, 40, 300));
        this.tint(hero, 0xffb060, 800);
        sfx.magic();
        break;
      case "staff-4": // Kettenblitz: Funken knistern am Stab
        fx.burst(this, this.front("hero"), 0xffe66b, 10, 30, 4);
        fx.flash(this, 0xffffff, 0.15, 120);
        sfx.thunder();
        break;
      case "staff-5": // Arkane Heilung: arkane Ringe und blaue Funken
        fx.ring(this, at, 0x7aa7f0, 70, 450);
        this.time.delayedCall(120, () => fx.ring(this, at, 0xb07cff, 50, 400));
        fx.rise(this, at, 0x9fd8ff, 14, 70);
        this.tint(hero, 0x9fd8ff, 600);
        sfx.heal();
        break;
      case "staff-6": // Arkaner Schild: Runen kreisen, Mana fliesst zurück
        fx.curseRing(this, at, 0x7aa7f0, () => fx.ring(this, at, 0xa9c6ff, 80, 450));
        fx.siphon(this, { x: at.x, y: at.y - 80 }, at, 0x4a7af0, 10);
        this.tint(hero, 0xa9c6ff, 700);
        sfx.magic();
        break;
      case "bow-4": // Jägermal: Beute ins Visier nehmen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, scaleX: 0.8, duration: 260, yoyo: true });
        fx.crosshair(this, this.center("enemy"), 0xff5a5a);
        sfx.whoosh(0.2);
        break;
      case "bow-5": // Brandpfeil: Pfeilspitze entzünden
        fx.rise(this, this.front("hero"), 0xf08a2c, 10, 20);
        fx.burst(this, this.front("hero"), 0xffe28f, 6, 16, 4);
        sfx.fire(0.3);
        break;
      case "bow-6": // Kopfschuss: ganz ruhig zielen
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, scaleX: 0.7, duration: 400, yoyo: true, hold: 150 });
        fx.crosshair(this, { x: this.center("enemy").x, y: this.center("enemy").y - 40 }, 0xffffff, 16, 450);
        break;
    }
  }

  /**
   * Bogenschuss: Sehne spannen, Pfeil fliegt zum Gegner. Beim Pfeilhagel
   * steigt er steil auf und fällt von oben auf das Ziel.
   */
  private shootArrow(
    target: fx.Point,
    onHit: () => void,
    { volley = false, trail, fast = false }: { volley?: boolean; trail?: number; fast?: boolean } = {},
  ) {
    const hero = this.fighters.hero;
    if (hero.weapon) {
      // Sehne spannen: Bogen kurz zurückziehen und leicht stauchen
      this.tweens.killTweensOf(hero.weapon);
      this.tweens.add({ targets: hero.weapon, x: hero.weapon.x - 1.2, scaleX: 0.85, duration: 110, yoyo: true, ease: "Quad.easeOut" });
    }
    this.makeTexture("arrow", ARROW_SPRITE);
    const arrow = this.add.image(0, 0, "arrow").setScale(5);
    // Leichte Streuung, damit beim Pfeilhagel nicht alle Pfeile gleich einschlagen
    const aim = volley ? { x: target.x + Phaser.Math.Between(-25, 25), y: target.y + Phaser.Math.Between(-15, 10) } : target;
    this.time.delayedCall(90, () => {
      sfx.bowShot();
      fx.projectile(this, this.front("hero"), aim, arrow, {
        duration: volley ? 460 : fast ? 140 : 240,
        arc: volley ? 170 : fast ? 0 : 16,
        face: true,
        trail,
        onArrive: () => {
          onHit();
          fx.burst(this, aim, 0xd0d4db, 6, 30, 4);
        },
      });
    });
  }

  private heroHit(event: Extract<BattleEvent, { type: "hit" }>, id: AbilityId | null) {
    const defender = event.add ?? "enemy";
    const hit = (shake = 0) => this.impact(defender, event.damage, event.crit, shake);
    const hero = this.fighters.hero;
    const target = this.center(defender);
    switch (id) {
      case "dagger": {
        // Hinter dem Gegner auftauchen, zustechen, zurück in den Schatten
        const body = hero.body;
        const scaleX = body.scaleX;
        body.setPosition(target.x + 75, body.y).setAlpha(0);
        body.scaleX = -Math.abs(scaleX);
        this.tweens.chain({
          targets: body,
          tweens: [
            { alpha: 1, duration: 120, onStart: () => sfx.whoosh(0.15) },
            {
              x: target.x + 45,
              duration: 90,
              onComplete: () => {
                hit();
                fx.slashes(this, target, 0xb07cff, 1, true);
                sfx.slash();
              },
            },
            { alpha: 0, duration: 140, delay: 120 },
            {
              alpha: 1,
              duration: 160,
              onStart: () => {
                body.setPosition(hero.homeX, body.y);
                body.scaleX = Math.abs(scaleX);
              },
            },
          ],
        });
        break;
      }
      case "sword":
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, target, 0xffffff, 1);
          sfx.slash();
        }, 80, 110);
        break;
      case "greatsword":
        fx.pillar(this, target, 0xffe66b);
        sfx.magic();
        this.time.delayedCall(150, () =>
          this.lunge("hero", () => {
            hit(0.012);
            fx.burst(this, target, 0xffe66b, 16, 70);
          }, 110),
        );
        break;
      case "axe": {
        // Die Axt fliegt drehend zum Gegner
        const axe = this.textures.exists("hero-weapon")
          ? this.add.image(0, 0, "hero-weapon").setScale(7)
          : this.add.rectangle(0, 0, 24, 24, 0xc8d0d8);
        hero.weapon?.setVisible(false);
        sfx.whoosh(0.33);
        fx.projectile(this, this.front("hero"), target, axe, {
          duration: 330,
          spin: 900,
          arc: 50,
          onArrive: () => {
            hit();
            fx.burst(this, target, 0xc8d0d8, 10, 50);
            hero.weapon?.setVisible(true).setAngle(0);
          },
        });
        break;
      }
      case "greataxe":
        // Spalter: Sprung, die Axt spaltet tief – Blut spritzt, auch auf die Umstehenden
        this.leapStrike("hero", () => {
          hit(0.012);
          fx.slashes(this, target, 0xc23a3a, 1);
          fx.burst(this, target, 0xc23a3a, 14, 90, 5);
          this.drips(target.x, GROUND_Y - 80);
        });
        break;
      case "mace":
        this.lunge("hero", () => {
          hit();
          fx.ring(this, { x: target.x, y: GROUND_Y - 120 }, 0xd39bf0, 50, 300);
        });
        break;
      case "greathammer":
        this.leapStrike("hero", () => {
          hit(0.02);
          fx.ring(this, { x: target.x, y: GROUND_Y }, 0xffe28f, 140, 450, true);
          sfx.quake(0.4);
          fx.groundWave(this, { x: target.x - 80, y: GROUND_Y }, { x: target.x + 80, y: GROUND_Y }, 0x8a7a60, 250);
        });
        break;
      case "scepter":
        fx.beam(this, this.front("hero"), target, 0x7dd3a8, 12, 420);
        sfx.beam();
        this.time.delayedCall(170, () => {
          hit();
          fx.rise(this, target, 0x7dd3a8, 12);
        });
        break;
      case "staff": {
        // Feuerball mit Glutspur und Explosion
        const ball = this.add.circle(0, 0, 16, 0xf08a2c).setStrokeStyle(5, 0xffe28f);
        sfx.fire(0.3);
        fx.projectile(this, this.front("hero"), target, ball, {
          duration: 340,
          arc: 20,
          trail: 0xc23a3a,
          onArrive: () => {
            hit(0.008);
            fx.burst(this, target, 0xf08a2c, 20, 90, 8);
            sfx.explosion();
            fx.ring(this, target, 0xffe28f, 90);
          },
        });
        break;
      }
      case "bow":
        this.shootArrow(target, () => hit(), { volley: true });
        break;

      /* ── zweite Fähigkeiten ── */
      case "dagger-2": {
        // Meucheln: blitzschnell heran, gekreuzter Doppelstich, Blut spritzt
        const body = hero.body;
        this.tweens.chain({
          targets: body,
          tweens: [
            { x: target.x - 60, duration: 110, ease: "Quad.easeIn", onStart: () => sfx.whoosh(0.12) },
            {
              x: target.x - 50,
              duration: 60,
              onComplete: () => {
                hit(0.01);
                fx.slashes(this, target, 0xff3a3a, 1);
                fx.slashes(this, target, 0xff3a3a, 1, true);
                fx.burst(this, target, 0xc23a3a, 18, 70, 5);
                sfx.slash();
              },
            },
            { x: hero.homeX, duration: 240, delay: 140, ease: "Quad.easeOut" },
          ],
        });
        break;
      }
      case "sword-2":
        // Parade: kurzer Hieb, dann zurück in die Deckung
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, target, 0xdde6ff, 1, true);
          sfx.slash();
          this.time.delayedCall(200, () => this.tint(hero, 0xa9c6ff, 500));
        }, 70, 100);
        break;
      case "greatsword-2":
        // Kriegsschrei: Hieb mit Schockwelle
        this.lunge("hero", () => {
          hit(0.01);
          fx.ring(this, target, 0xf08a2c, 80, 360);
          fx.slashes(this, target, 0xffc27a, 1);
        }, 100);
        break;
      case "axe-2":
        // Zerfleischen: Klauenhiebe, abwechselnd von beiden Seiten
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, target, 0xc23a3a, 3, event.crit);
          fx.burst(this, target, 0xc23a3a, 8, 40, 4);
          sfx.slash();
        }, 85, 110);
        break;
      case "greataxe-2":
        // Blutrausch: Sprungangriff, dann fliesst Blut zum Helden
        this.leapStrike("hero", () => {
          hit(0.012);
          fx.burst(this, target, 0xc23a3a, 14, 60);
          fx.siphon(this, target, this.center("hero"), 0xc23a3a, 12);
          sfx.drain();
        });
        break;
      case "mace-2":
        // Heiliges Licht: leichter, leuchtender Schlag
        this.lunge("hero", () => {
          hit();
          fx.burst(this, target, 0xffe9a0, 12, 50);
        }, 80);
        break;
      case "greathammer-2":
        // Erdbeben: Hammer in den Boden, Bebenwelle rollt zum Gegner
        this.tweens.add({ targets: hero.body, y: hero.body.y + 6, duration: 90, yoyo: true });
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: 20, duration: 120, onComplete: () => hero.weapon?.setAngle(0) });
        this.cameras.main.shake(500, 0.012);
        sfx.quake(0.6);
        fx.groundWave(this, { x: hero.homeX + 40, y: GROUND_Y }, { x: target.x, y: GROUND_Y }, 0x8a7a60, 380, () => {
          hit(0.015);
          fx.cracks(this, target);
          fx.ring(this, { x: target.x, y: GROUND_Y }, 0xc8b090, 120, 420, true);
          this.floatText(target.x, GROUND_Y - 140, "GESCHWÄCHT", "#c8b090", 22);
        });
        break;
      case "scepter-2":
        // Fluch: violetter Strahl, Runen umkreisen das Ziel
        fx.beam(this, this.front("hero"), target, 0x8a4ad0, 10, 420);
        sfx.curse();
        this.time.delayedCall(170, () => {
          hit();
          fx.ring(this, target, 0x8a4ad0, 60, 500);
          fx.rise(this, target, 0x5a2a8a, 10);
          this.floatText(target.x, GROUND_Y - 140, "VERFLUCHT", "#b07cff", 22);
          this.tint(this.fighters[defender], 0x8a4ad0, 900);
        });
        break;
      case "staff-2": {
        // Meteor: stürzt brennend vom Himmel
        const meteor = this.add.circle(0, 0, 26, 0xc23a3a).setStrokeStyle(6, 0xf08a2c);
        sfx.fire(0.5);
        fx.projectile(this, { x: target.x + 160, y: -40 }, target, meteor, {
          duration: 520,
          arc: 0,
          trail: 0xf08a2c,
          onArrive: () => {
            hit(0.03);
            fx.flash(this, 0xffb060, 0.5, 220);
            fx.burst(this, target, 0xf08a2c, 30, 120, 9);
            fx.ring(this, { x: target.x, y: GROUND_Y }, 0xffe28f, 150, 500, true);
            fx.cracks(this, target);
            sfx.explosion();
          },
        });
        break;
      }
      case "bow-2": {
        // Durchbohrender Schuss: ein schneller, gerader Pfeil mit Leuchtspur
        const from = this.front("hero");
        fx.beam(this, from, target, 0xffe28f, 4, 260);
        this.shootArrow(target, () => {
          hit(0.008);
          fx.burst(this, target, 0xc23a3a, 12, 60);
          fx.burst(this, { x: target.x + 40, y: target.y }, 0xffe28f, 8, 40);
        });
        break;
      }

      /* ── dritte Fähigkeiten (Zweihandwaffen) ── */
      case "greatsword-3":
        // Klingensturm: schnelle, wuchtige Hiebe
        this.lunge("hero", () => {
          hit(0.006);
          fx.slashes(this, target, 0xffc27a, 1, event.crit);
          sfx.slash();
        }, 90, 100);
        break;
      case "greataxe-3":
        // Enthaupten: Sprung, ein gewaltiger Hieb von oben
        this.leapStrike("hero", () => {
          hit(0.015);
          fx.slashes(this, target, 0xff3a3a, 1);
          fx.burst(this, target, 0xc23a3a, 16, 70, 5);
          sfx.slash();
        });
        break;
      case "greathammer-3":
        // Schockwelle: Aufprall mit Blitzen
        this.leapStrike("hero", () => {
          hit(0.02);
          fx.lightning(this, target);
          fx.ring(this, { x: target.x, y: GROUND_Y }, 0xffe66b, 140, 450, true);
          sfx.quake(0.4);
        });
        break;
      case "staff-3":
        // Eissplitter: die schwebenden Splitter schiessen nacheinander auf den Gegner
        sfx.whoosh(0.3);
        (this.iceShards ?? fx.iceShards(this, this.center("hero"))).launch(target, () => {
          hit(0.006);
          fx.ring(this, target, 0x9fd8ff, 60, 400);
        });
        this.iceShards = null;
        break;
      case "bow-3":
        // Ausweichschuss: schiessen und dabei zurückspringen
        this.shootArrow(target, () => hit());
        this.tweens.add({ targets: hero.body, x: hero.homeX - 50, duration: 180, yoyo: true, hold: 260, ease: "Quad.easeOut" });
        this.time.delayedCall(200, () => this.tint(hero, 0xa9c6ff, 500));
        break;

      /* ── weitere Fähigkeiten ── */
      case "dagger-3":
        // Giftklinge: flinker Stich, grünes Gift spritzt
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, target, 0x7dd3a8, 1);
          fx.burst(this, target, 0x7dd3a8, 12, 50, 5);
          fx.rise(this, target, 0x4a9a6a, 8, 40);
          sfx.slash();
        }, 85, 100);
        break;
      case "dagger-4": {
        // Schattenschritt: zustechen, in einer Rauchwolke verschwinden, halb durchsichtig zurück
        const body = hero.body;
        this.tweens.chain({
          targets: body,
          tweens: [
            { x: target.x - 55, duration: 110, ease: "Quad.easeIn", onStart: () => sfx.whoosh(0.12) },
            {
              alpha: 0,
              duration: 120,
              delay: 60,
              onStart: () => {
                hit();
                fx.slashes(this, target, 0xb07cff, 1, true);
                sfx.slash();
              },
              onComplete: () => {
                fx.burst(this, { x: body.x, y: target.y }, 0x2a1a3a, 16, 60, 8);
                body.setX(hero.homeX);
              },
            },
            { alpha: 0.4, duration: 160, delay: 80, onStart: () => fx.burst(this, this.center("hero"), 0x2a1a3a, 10, 40, 6) },
            { alpha: 1, duration: 300, delay: 450 },
          ],
        });
        break;
      }
      case "sword-3":
        // Finte: angedeuteter Stich, kurz zurück – dann der echte, die Deckung ist offen
        this.tweens.add({ targets: hero.body, x: hero.homeX + 35, duration: 90, yoyo: true });
        this.time.delayedCall(200, () =>
          this.lunge("hero", () => {
            hit();
            fx.slashes(this, target, 0xffffff, 1);
            fx.ring(this, target, 0xa9c6ff, 50, 350);
            this.floatText(target.x, GROUND_Y - 140, "DECKUNG OFFEN", "#a9c6ff", 20);
            sfx.slash();
          }, 80, 100),
        );
        break;
      case "sword-4": {
        // Entwaffnen: tiefer Hieb, die Waffe des Gegners fliegt davon
        const low = { x: target.x - 20, y: target.y + 15 };
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, low, 0xdde6ff, 1, true);
          fx.burst(this, low, 0xffffff, 8, 30, 4);
          const blade = this.add.rectangle(low.x, low.y, 34, 7, 0xa0a8b0).setStrokeStyle(2, 0x1b1424).setDepth(21);
          this.tweens.add({ targets: blade, x: low.x + 110, y: low.y - 90, angle: 540, alpha: 0, duration: 650, ease: "Quad.easeOut", onComplete: () => blade.destroy() });
          this.floatText(target.x, GROUND_Y - 140, "ENTWAFFNET", "#dde6ff", 20);
          sfx.slash();
        }, 90, 120);
        break;
      }
      case "axe-3":
        // Hackwirbel: drehend in die Gegner
        this.tweens.add({ targets: hero.body, angle: 360, duration: 280, onComplete: () => hero.body.setAngle(0) });
        this.lunge("hero", () => {
          hit();
          fx.whirl(this, target, 0xc8d0d8);
          fx.slashes(this, target, 0xc8d0d8, 2);
          sfx.slash();
        }, 95, 140);
        break;
      case "axe-4":
        // Ausbluten: ein tiefer Hieb in die Wunde, Blut strömt
        this.lunge("hero", () => {
          hit(0.01);
          fx.slashes(this, target, 0x8a1a1a, 1);
          fx.burst(this, target, 0xc23a3a, 20, 80, 6);
          this.drips(target.x, GROUND_Y - 90);
          sfx.slash();
          sfx.bleed();
        }, 95, 130);
        break;
      case "mace-3":
        // Läuterung: Schlag, dann löst sich alles Üble als dunkler Rauch vom Helden
        this.lunge("hero", () => {
          hit();
          fx.burst(this, target, 0xffffff, 10, 40);
          this.time.delayedCall(200, () => {
            const at = this.center("hero");
            fx.burst(this, at, 0x3a2a3a, 14, 70, 6);
            fx.rise(this, at, 0xffffff, 12, 60);
            fx.ring(this, at, 0xbfe9ff, 70, 400);
            sfx.heal();
          });
        }, 80);
        break;
      case "mace-4":
        // Heiliger Hammer: Schlag, ein Lichtkreuz flammt am Gegner auf
        this.lunge("hero", () => {
          hit(0.01);
          fx.beam(this, { x: target.x, y: target.y - 80 }, { x: target.x, y: target.y + 60 }, 0xffe9a0, 14, 500);
          fx.beam(this, { x: target.x - 55, y: target.y - 20 }, { x: target.x + 55, y: target.y - 20 }, 0xffe9a0, 14, 500);
          fx.burst(this, target, 0xffe9a0, 14, 60);
          fx.flash(this, 0xfff4c0, 0.25, 200);
          sfx.magic();
        }, 95, 130);
        break;
      case "scepter-3": {
        // Seelenfeuer: violette Flammenkugel, der Gegner lodert dunkel auf
        const ball = this.add.circle(0, 0, 14, 0x5a2a8a).setStrokeStyle(5, 0xb07cff);
        sfx.fire(0.35);
        fx.projectile(this, this.front("hero"), target, ball, {
          duration: 380,
          arc: 30,
          trail: 0x8a4ad0,
          onArrive: () => {
            hit();
            fx.burst(this, target, 0xb07cff, 16, 70, 7);
            fx.rise(this, target, 0x8a4ad0, 14, 60);
            this.tint(this.fighters[defender], 0x8a4ad0, 500);
          },
        });
        break;
      }
      case "scepter-4":
        // Lebensentzug: dunkelroter Strahl, das Leben fliesst zum Helden
        fx.beam(this, this.front("hero"), target, 0x8a2a4a, 12, 600);
        sfx.drain();
        this.time.delayedCall(200, () => {
          hit();
          fx.siphon(this, target, this.center("hero"), 0xc23a3a, 16);
          this.time.delayedCall(450, () => this.tint(hero, 0x9dffc8, 400));
        });
        break;
      case "shield-3":
        // Schildstoss: harter Stoss mit dem Schildrand
        this.lunge("hero", () => {
          hit(0.01);
          fx.ring(this, target, 0xa9c6ff, 60, 300);
          fx.burst(this, target, 0xdde6ff, 12, 50, 5);
          sfx.block();
        }, 100, 110);
        break;
      case "shield-4":
        // Schildwall: kurzer Hieb, dann hinter dem Schild in Deckung
        this.lunge("hero", () => {
          hit();
          fx.burst(this, target, 0xa9c6ff, 8, 40);
          this.time.delayedCall(220, () => {
            fx.ring(this, this.center("hero"), 0x8a8a9a, 70, 450);
            this.tint(hero, 0xa0a8b0, 700);
            sfx.block();
          });
        }, 70);
        break;
      case "greatsword-4":
        // Kreuzhieb: jeder Hieb hinterlässt ein X
        this.lunge("hero", () => {
          hit(0.006);
          fx.slashes(this, target, 0xdde6ff, 1);
          fx.slashes(this, target, 0xdde6ff, 1, true);
          sfx.slash();
        }, 100, 120);
        break;
      case "greatsword-5":
        // Konterstellung: Hieb, dann zurück in Lauerstellung
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, target, 0xffffff, 1);
          sfx.slash();
          this.time.delayedCall(260, () => {
            this.tweens.add({ targets: hero.body, scaleY: hero.body.scaleY * 0.92, duration: 150, yoyo: true, hold: 400 });
            fx.ring(this, { x: hero.homeX, y: GROUND_Y }, 0xa9c6ff, 80, 500, true);
            this.tint(hero, 0xa9c6ff, 600);
          });
        }, 90);
        break;
      case "greatsword-6":
        // Mordschlag: dumpfer Knaufschlag, Funken und Staub
        this.lunge("hero", () => {
          hit(0.012);
          fx.ring(this, { x: target.x, y: target.y - 30 }, 0xc8b090, 45, 280);
          fx.burst(this, { x: target.x, y: target.y - 30 }, 0xffe66b, 10, 40, 4);
          sfx.block();
        }, 100, 120);
        break;
      case "greataxe-4":
        // Wirbelwind: als Wirbel in die Gegner, Staub fliegt
        this.tweens.add({ targets: hero.body, angle: 720, duration: 340, onComplete: () => hero.body.setAngle(0) });
        this.lunge("hero", () => {
          hit(0.006);
          fx.whirl(this, target, 0xff8a5a);
          fx.rise(this, { x: target.x, y: GROUND_Y - 10 }, 0xc8b090, 10, 90);
          sfx.slash();
        }, 100, 170);
        break;
      case "greataxe-5":
        // Wutschrei: Sprung mit rotem Einschlag
        this.leapStrike("hero", () => {
          hit(0.012);
          fx.slashes(this, target, 0xff3a3a, 1);
          fx.ring(this, target, 0xff3a3a, 70, 350);
          this.tint(hero, 0xff6a6a, 400);
        });
        break;
      case "greataxe-6":
        // Raserei: kurze, wilde Hiebe aus allen Richtungen
        this.lunge("hero", () => {
          hit();
          fx.slashes(this, { x: target.x + Phaser.Math.Between(-15, 15), y: target.y + Phaser.Math.Between(-15, 15) }, 0xff6a3a, 2, Math.random() < 0.5);
          fx.burst(this, target, 0xc23a3a, 6, 40, 4);
          sfx.slash();
        }, 70, 70);
        break;
      case "greathammer-4":
        // Zertrümmern: die Panzerung zerspringt in Splitter
        this.leapStrike("hero", () => {
          hit(0.015);
          fx.cracks(this, target);
          fx.burst(this, target, 0xa0a8b0, 18, 90, 8);
          this.floatText(target.x, GROUND_Y - 135, "RÜSTUNG ↓", "#f0776a", 20);
          sfx.block();
        });
        break;
      case "staff-4":
        // Kettenblitz: Blitz vom Stab zum Gegner, von oben schlägt es ein
        fx.beam(this, this.front("hero"), target, 0xffe66b, 6, 300);
        sfx.thunder();
        this.time.delayedCall(120, () => {
          hit(0.008);
          fx.lightning(this, target);
          fx.burst(this, target, 0xffe66b, 12, 60, 4);
        });
        break;
      case "bow-4":
        // Jägermal: Treffer markiert die Beute
        this.shootArrow(target, () => {
          hit();
          fx.crosshair(this, target, 0xff5a5a, 35, 700);
          this.floatText(target.x, GROUND_Y - 140, "MARKIERT", "#ff8a7a", 20);
        });
        break;
      case "bow-5":
        // Brandpfeil: brennender Pfeil mit Glutspur
        sfx.fire(0.3);
        this.shootArrow(target, () => {
          hit();
          fx.burst(this, target, 0xf08a2c, 14, 60, 6);
          fx.rise(this, target, 0xf08a2c, 12, 50);
          sfx.burn();
        }, { trail: 0xf08a2c });
        break;
      case "bow-6": {
        // Kopfschuss: blitzschnell, gerade auf den Kopf
        const head = { x: target.x, y: target.y - 40 };
        this.shootArrow(head, () => {
          hit(0.012);
          fx.flash(this, 0xffffff, 0.3, 150);
          fx.burst(this, head, 0xffffff, 10, 40, 4);
          fx.burst(this, head, 0xc23a3a, 12, 50, 5);
        }, { trail: 0xffffff, fast: true });
        break;
      }
      default:
        // Mit dem Bogen wird auch normal geschossen statt zugeschlagen.
        if (this.setup.heroWeapon?.type === "bow") this.shootArrow(target, () => hit());
        else this.lunge("hero", () => hit());
    }
  }

  /* ───────────── Fähigkeiten der Bosse ───────────── */

  /** Ankündigung mit eigenem Effekt pro Fähigkeit – die erste Fähigkeit eines Bosses hat seine Id. */
  private announceBossAbility(abilityId: string) {
    const enemy = this.fighters.enemy;
    const ability = getBossAbilityById(abilityId);
    this.floatText(enemy.homeX, GROUND_Y - 130, `${ability?.name ?? "Spezialangriff"}!`, "#f0776a", 28);
    this.tint(enemy, 0xff6b5a, 400);
    this.cameras.main.shake(250, 0.006);
    sfx.roar();
    const at = this.center("enemy");
    switch (abilityId) {
      case "primal-mammoth": // Aufbäumen vor dem Stampfer
        enemy.breath?.pause();
        this.tweens.add({
          targets: enemy.body,
          angle: 12,
          y: (enemy.groundY ?? enemy.body.y) - 30,
          duration: 250,
          yoyo: true,
          onComplete: () => enemy.breath?.resume(),
        });
        break;
      case "cave-eye":
      case "lich-king":
      case "high-priestess":
        fx.rise(this, at, abilityId === "high-priestess" ? 0x3ad6c5 : 0xb07cff, 12, 80);
        break;
      case "high-priestess-spear": // Licht sammelt sich
        fx.rise(this, at, 0xf4c95d, 12, 80);
        break;
      case "storm-lord":
      case "storm-lord-discharge":
      case "storm-lord-thunder": // Himmel verdunkelt sich
        fx.flash(this, 0x141e36, 0.5, 400);
        break;
      case "ignaroth":
      case "void-lord":
      case "void-lord-wave":
        fx.siphon(this, { x: at.x + 60, y: at.y + 30 }, this.front("enemy"), abilityId === "ignaroth" ? 0xf08a2c : 0x5a2a8a);
        break;
    }
  }

  /** Treffer des Gegners – bei Boss-Fähigkeiten (`abilityId`) mit deren eigenem Effekt. */
  private enemyHit(event: Extract<BattleEvent, { type: "hit" }>, abilityId: string | null) {
    const hit = (shake = 0) => this.impact("hero", event.damage, event.crit, shake);
    const target = this.center("hero");
    const enemyAt = this.front("enemy");
    switch (abilityId) {
      case "goblin-chief": // Rasender Hieb: schnelle Hiebe mit roten Schnitten
        this.lunge("enemy", () => {
          hit();
          fx.slashes(this, target, 0xf0776a, 2, true);
          sfx.slash();
        }, 90, 100);
        break;
      case "ancient-lizard": // Giftbiss: Zähne und Giftblasen
        this.lunge("enemy", () => {
          hit();
          fx.slashes(this, target, 0xf5f2ea, 2);
          sfx.poison();
          fx.rise(this, target, 0x7dd3a8, 12);
        });
        break;
      case "cave-eye": // Lähmender Blick: violetter Strahl aus dem Auge
        fx.beam(this, enemyAt, target, 0xb07cff, 14, 450);
        sfx.beam();
        this.time.delayedCall(180, () => hit());
        break;
      case "primal-mammoth": // Erdstampfer: Schockwelle über den Boden
        fx.ring(this, { x: this.fighters.enemy.homeX, y: GROUND_Y }, 0xc8b090, 150, 450, true);
        sfx.quake(0.7);
        fx.groundWave(this, { x: enemyAt.x, y: GROUND_Y }, { x: target.x, y: GROUND_Y }, 0x8a6a4a, 330, () => {
          hit(0.02);
          fx.burst(this, { x: target.x, y: GROUND_Y - 20 }, 0x8a6a4a, 14, 70);
        });
        break;
      case "lich-king": // Lebensentzug: dunkler Strahl
        fx.beam(this, enemyAt, target, 0x5a2a8a, 14, 450);
        sfx.beam(true);
        this.time.delayedCall(180, () => hit());
        break;
      case "ignaroth": // Feueratem
        fx.fireStream(this, enemyAt, target, 420);
        sfx.fire(0.5);
        this.time.delayedCall(260, () => hit(0.008));
        break;
      case "ore-king": // Erzlawine: Steine prasseln herab
        fx.rockfall(this, target, [0x8a909a, 0x6a7280, 0xc0602f], () => hit(0.012));
        sfx.quake(0.8);
        break;
      case "high-priestess": // Fluch der Mumie: Zeichenkreis zieht sich zusammen
        fx.curseRing(this, target, 0x3ad6c5, () => hit());
        sfx.curse();
        break;
      case "storm-lord": // Kettenblitz: Blitz von oben
      case "storm-lord-discharge": // Entladung: ein einziger, greller Blitz
        fx.lightning(this, target);
        sfx.thunder();
        this.time.delayedCall(60, () => hit());
        break;
      case "void-lord": // Leerenschlund: Strudel am Helden
        fx.vortex(this, target, [0x5a2a8a, 0x4af0ff]);
        sfx.curse();
        this.time.delayedCall(320, () => hit(0.01));
        break;
      case "ore-king-pick": // Spitzhackenhieb: wuchtiger Schlag, die Wunde blutet
        this.lunge("enemy", () => {
          hit(0.01);
          fx.slashes(this, target, 0xc23a3a, 2, true);
          sfx.slash();
        });
        break;
      case "high-priestess-spear": // Sonnenspeer: goldener Strahl
        fx.beam(this, enemyAt, target, 0xf4c95d, 14, 420);
        sfx.beam();
        this.time.delayedCall(180, () => hit());
        break;
      case "storm-lord-thunder": // Donnerschlag: ein greller Blitz
        fx.lightning(this, target);
        fx.flash(this, 0xffffff, 0.35, 150);
        sfx.thunder();
        this.time.delayedCall(60, () => hit(0.015));
        break;
      case "void-lord-wave": // Leerenwelle: dunkle Welle über den Boden
        fx.groundWave(this, { x: enemyAt.x, y: GROUND_Y }, { x: target.x, y: GROUND_Y }, 0x5a2a8a, 330, () => {
          hit(0.01);
          fx.ring(this, target, 0x5a2a8a, 70, 380);
        });
        sfx.curse();
        break;
      default:
        this.lunge(event.add ?? "enemy", () => hit());
    }
  }

  /**
   * Schwung der Waffe passend zum Ausfallschritt (140 ms hin, 140 ms zurück):
   * ausholen, beim Treffer nach vorne durchziehen, dann zurück in die Ruhelage.
   */
  private swing(weapon: Phaser.GameObjects.Image) {
    this.tweens.killTweensOf(weapon);
    this.tweens.chain({
      targets: weapon,
      tweens: [
        { angle: -45, duration: 80, ease: "Quad.easeOut" },
        { angle: 110, duration: 70, ease: "Quad.easeIn" },
        { angle: 0, duration: 260, ease: "Back.easeOut", delay: 80 },
      ],
    });
  }

  private showDefeat(side: Side, instant: boolean) {
    const f = this.fighters[side];
    this.tweens.killTweensOf(f.body);
    if (f.weapon) this.tweens.killTweensOf(f.weapon);
    const duration = instant ? 0 : 600;
    if (side === "hero") {
      this.tweens.add({ targets: f.body, angle: -90, alpha: 0.5, x: f.homeX - 20, duration });
    } else {
      this.tweens.add({ targets: f.body, alpha: 0, scale: f.body.scale * 0.6, y: f.body.y + 20, duration });
    }
    const won = side === "enemy";
    // Kurz warten, damit der letzte Treffer ausklingt
    if (!instant) this.time.delayedCall(250, () => (won ? sfx.victory() : sfx.defeat()));
    const banner = this.add
      .text(SCENE_WIDTH / 2, 140, won ? "SIEG!" : "NIEDERLAGE", {
        fontFamily: FONT,
        fontSize: "56px",
        color: won ? "#f4c95d" : "#f0776a",
      })
      .setOrigin(0.5)
      .setStroke("#0e0b16", 8)
      .setScale(instant ? 1 : 0.2);
    if (!instant) this.tweens.add({ targets: banner, scale: 1, duration: 450, ease: "Back.easeOut", delay: 250 });
  }

  /**
   * Zweite Phase des Bosses: Name gross in der Mitte, der Boss brüllt – bei Raserei glüht er rot,
   * beim Sammelruf stehen die Begleiter mit vollen Lebenspunkten wieder auf.
   */
  private showBossPhase(bossId: string, rally: string[]) {
    const phase = getBossPhase(bossId);
    const enemy = this.fighters.enemy;
    sfx.roar();
    this.cameras.main.shake(350, 0.01);
    fx.flash(this, phase?.enrage ? 0xc23a3a : 0xf4c95d, 0.25, 250);
    const banner = iconText(
      this,
      SCENE_WIDTH / 2,
      120,
      `${phase?.icon ?? ""} ${phase?.name ?? "Zweite Phase"}`.trim(),
      { fontFamily: FONT, fontSize: "40px", color: phase?.enrage ? "#f0776a" : "#f4c95d" },
      { color: "#0e0b16", width: 7 },
    )
      .setScale(0.3)
      .setDepth(6);
    this.tweens.chain({
      targets: banner,
      tweens: [
        { scale: 1, duration: 300, ease: "Back.easeOut" },
        { alpha: 0, duration: 400, delay: 500, onComplete: () => banner.destroy() },
      ],
    });
    if (phase?.enrage) {
      this.tint(enemy, 0xff6b5a, 900);
      fx.rise(this, this.center("enemy"), 0xc23a3a, 14, 90);
    }
    for (const uid of rally) this.reviveAdd(uid);
  }

  /** Elite „Explosiv“: Der Gegner zerbirst in einer Feuerwolke, die Druckwelle trifft den Helden. */
  private showExplosion(damage: number, blocked: boolean) {
    const enemy = this.fighters.enemy;
    const at = this.center("enemy");
    this.tweens.killTweensOf(enemy.body);
    sfx.explosion();
    fx.flash(this, 0xf08a2c, 0.35, 200);
    fx.burst(this, at, 0xf08a2c, 26, 120, 8);
    fx.burst(this, at, 0xffe28f, 16, 80, 6);
    fx.ring(this, at, 0xf08a2c, 160, 450);
    this.cameras.main.shake(300, 0.015);
    this.tweens.add({ targets: enemy.body, alpha: 0, scale: enemy.body.scale * 1.3, duration: 300 });
    fx.groundWave(this, { x: enemy.homeX, y: GROUND_Y }, { x: this.fighters.hero.homeX, y: GROUND_Y }, 0xf08a2c, 350, () => {
      const hero = this.fighters.hero;
      if (blocked) {
        this.floatText(hero.homeX, GROUND_Y - 115, "GEBLOCKT!", "#7aa7f0", 28);
        fx.ring(this, { x: hero.homeX, y: GROUND_Y - 70 }, 0xa9c6ff, 110);
        sfx.block();
        this.bulwark?.destroy();
        this.bulwark = null;
      } else {
        this.impact("hero", damage, false, 0.012);
      }
    });
  }

  /** Sammelruf: Der Begleiter steht (wieder) auf, mit vollen Lebenspunkten. */
  private reviveAdd(uid: string) {
    const f = this.fighters[uid];
    if (!f) return;
    this.tweens.killTweensOf(f.body);
    const groundY = f.groundY ?? f.body.y;
    this.tweens.add({
      targets: f.body,
      alpha: 1,
      angle: 0,
      y: groundY,
      duration: 400,
      ease: "Back.easeOut",
      onComplete: () => {
        f.breath = this.tweens.add({ targets: f.body, y: groundY - 4, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });
    f.images[0].setInteractive();
    this.setHp(uid, f.maxHp);
    fx.pillar(this, this.center(uid), 0xf4c95d, 50);
  }

  /** Ein Begleiter fällt – er sinkt zusammen und verblasst, der Kampf geht weiter. */
  private showAddDefeat(uid: string, instant: boolean) {
    const f = this.fighters[uid];
    this.tweens.killTweensOf(f.body);
    f.body.disableInteractive();
    f.images.forEach((image) => image.disableInteractive());
    this.tweens.add({ targets: f.body, alpha: 0.2, angle: 12, y: (f.groundY ?? f.body.y) + 8, duration: instant ? 0 : 500 });
    if (!instant) sfx.hit(false);
  }

  /** Der Held dreht um und rennt aus dem Bild. */
  private showFlight(instant: boolean) {
    const hero = this.fighters.hero.body;
    this.tweens.killTweensOf(hero);
    hero.scaleX = -Math.abs(hero.scaleX); // spiegeln: Container kennen kein setFlipX
    this.tweens.add({ targets: hero, x: -80, duration: instant ? 0 : 700, ease: "Quad.easeIn" });
    if (!instant) sfx.flee();
    const banner = this.add
      .text(SCENE_WIDTH / 2, 140, "GEFLOHEN", { fontFamily: FONT, fontSize: "48px", color: "#a49cb8" })
      .setOrigin(0.5)
      .setStroke("#0e0b16", 8)
      .setAlpha(instant ? 1 : 0);
    if (!instant) this.tweens.add({ targets: banner, alpha: 1, duration: 300, delay: 400 });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    const t = iconText(this, x, y, text, { fontFamily: NUMBER_FONT, fontSize: `${size}px`, fontStyle: "bold", color }, { color: "#0e0b16", width: 5 });
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  /** Blutstropfen fallen von der Figur zu Boden. */
  private drips(x: number, y: number) {
    for (let i = 0; i < 7; i++) {
      const p = this.add.rectangle(x + Phaser.Math.Between(-35, 35), y + Phaser.Math.Between(-30, 20), 5, 7, 0xc23a3a);
      this.tweens.add({
        targets: p,
        y: GROUND_Y - Phaser.Math.Between(0, 8),
        alpha: 0,
        duration: Phaser.Math.Between(450, 700),
        delay: Phaser.Math.Between(0, 200),
        ease: "Quad.easeIn",
        onComplete: () => p.destroy(),
      });
    }
  }

  private sparkles(x: number, y: number, color: number) {
    for (let i = 0; i < 10; i++) {
      const p = this.add.rectangle(x + Phaser.Math.Between(-40, 40), y + Phaser.Math.Between(-30, 50), 5, 5, color);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(30, 70),
        alpha: 0,
        duration: Phaser.Math.Between(500, 800),
        onComplete: () => p.destroy(),
      });
    }
  }
}
