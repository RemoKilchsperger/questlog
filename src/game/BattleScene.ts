// Phaser-Kampfszene: zeigt Held und Kreatur, Lebensbalken und animiert die
// Ereignisse, die der Store über den EventBus schickt. Die Szene rechnet
// selbst nichts aus – alle Werte kommen aus der Domain (src/domain/combat.ts).

import Phaser from "phaser";
import { getAbility } from "../domain/abilities";
import { getBossAbility } from "../domain/bossAbilities";
import type { BattleEvent, BattleState, Side } from "../domain/combat";
import type { SkillWeapon } from "../domain/skills";
import { BG_HEIGHT, BG_SCALE, BG_WIDTH, hasBackground, paintBackground } from "./backgrounds";
import * as fx from "./battleEffects";
import { getCreatureSprite } from "./creatureSprites";
import { EventBus } from "./EventBus";
import { music } from "./music";
import { sfx } from "./sfx";
import type { HeldWeapon } from "./heroSprite";
import { paintSprite, renderSprite, type PixelImage, type SpriteDef } from "./sprites";

export const SCENE_WIDTH = 720;
export const SCENE_HEIGHT = 320;

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
}

const FONT = '"Pixelify Sans", monospace';
/** Zahlen in einer gut lesbaren Schrift – in der Pixelschrift sehen 5/S und 8/S gleich aus. */
const NUMBER_FONT = '"Inter", sans-serif';
const GROUND_Y = 250;
const HERO_X = 190;
const ENEMY_X = 530;
const BAR_WIDTH = 160;

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
  /** Stand-Position am Boden */
  groundY?: number;
  /** Atem-Animation – wird bei Sprüngen pausiert */
  breath?: Phaser.Tweens.Tween;
}

export class BattleScene extends Phaser.Scene {
  private setup!: BattleSceneData;
  private fighters!: Record<Side, Fighter>;
  /** Kuppel von Bollwerk – bleibt sichtbar, bis sie einen Angriff blockt */
  private bulwark: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super("battle");
  }

  init(data: BattleSceneData) {
    this.setup = data;
  }

  create() {
    const { battle, colors } = this.setup;
    this.drawBackground(colors, this.setup.areaId);

    const hero = this.addBody(HERO_X, "hero", this.setup.heroSprite, 9, this.setup.heroWeapon);
    const enemy = this.addBody(
      ENEMY_X,
      `creature-${this.setup.enemySprite}`,
      getCreatureSprite(this.setup.enemySprite),
      this.setup.boss ? 9.5 : 8,
    );

    this.addHeroGlow(hero);

    this.fighters = {
      hero: this.createFighter(hero, battle.hero.name, battle.hero.level, battle.hero.hp, battle.hero.maxHp),
      enemy: this.createFighter(enemy, battle.enemy.name, battle.enemy.level, battle.enemy.hp, battle.enemy.maxHp),
    };

    // Leichtes Atmen, damit die Szene lebt.
    for (const f of Object.values(this.fighters)) {
      f.groundY = f.body.y;
      f.breath = this.tweens.add({
        targets: f.body,
        y: f.body.y - 4,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    if (battle.status === "won") this.showDefeat("enemy", true);
    if (battle.status === "lost") this.showDefeat("hero", true);
    if (battle.status === "fled") this.showFlight(true);

    const off = EventBus.on("battle:events", ({ battle: next, events }) => {
      if (next.id === this.setup.battle.id) this.play(events, next.id);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.events.once(Phaser.Scenes.Events.DESTROY, off);

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
      // +1 wegen des Umrisses, +0.5 für die Pixelmitte
      const handX = held.hand.x + 1.5 - image.width / 2;
      const handY = held.hand.y + 1.5 - (lastRow + 1);
      weapon = this.add
        .image(handX, handY, `${key}-weapon`)
        .setOrigin((held.grip.x + 1.5) / weaponImage.width, (held.grip.y + 1.5) / weaponImage.height);
    }

    // Bögen vor dem Körper, alle anderen Waffen dahinter (wie in heroSprite.ts)
    const images = weapon ? (held?.type === "bow" ? [figure, weapon] : [weapon, figure]) : [figure];
    const body = this.add.container(x, GROUND_Y + 4, images).setScale(scale);
    return { body, images, weapon };
  }

  /**
   * Boss-Items leuchten in ihren Rüstungsfarben: ein weicher Schein hinter dem
   * Helden, ein pulsierender Schimmer darüber und ein Glühen um die Hauptwaffe.
   * Die Effekte (preFX) gibt es nur mit WebGL – im Canvas-Modus bleibt der Schimmer.
   */
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

  private createFighter(
    parts: Pick<Fighter, "body" | "images" | "weapon">,
    name: string,
    level: number,
    hp: number,
    maxHp: number,
  ): Fighter {
    const x = parts.body.x;
    this.add
      .text(x, 26, `${name} · Lv. ${level}`, {
        fontFamily: NUMBER_FONT,
        fontSize: "17px",
        fontStyle: "bold",
        color: "#efe6d2",
      })
      .setOrigin(0.5, 0)
      .setStroke("#0e0b16", 4);
    const bar = this.add.graphics();
    const hpText = this.add
      .text(x, 66, "", { fontFamily: NUMBER_FONT, fontSize: "14px", fontStyle: "bold", color: "#efe6d2" })
      .setOrigin(0.5, 0)
      .setStroke("#0e0b16", 3);
    const fighter: Fighter = { ...parts, bar, hpText, hp, maxHp, homeX: x };
    this.drawBar(fighter, hp);
    return fighter;
  }

  private drawBar(f: Fighter, hp: number) {
    const ratio = Phaser.Math.Clamp(hp / f.maxHp, 0, 1);
    const color = ratio > 0.5 ? 0x7dd3a8 : ratio > 0.25 ? 0xf4c95d : 0xf0776a;
    const x = f.homeX - BAR_WIDTH / 2;
    f.bar.clear();
    f.bar.fillStyle(0x0e0b16).fillRect(x - 3, 50 - 3, BAR_WIDTH + 6, 16);
    f.bar.fillStyle(0x2e2640).fillRect(x, 50, BAR_WIDTH, 10);
    f.bar.fillStyle(color).fillRect(x, 50, Math.round(BAR_WIDTH * ratio), 10);
    f.hpText.setText(`${Math.round(hp)} / ${f.maxHp} LP`);
  }

  /** Lebensbalken weich auf den neuen Wert bringen. */
  private setHp(side: Side, hp: number) {
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
  private play(events: BattleEvent[], battleId: string) {
    let delay = 0;
    let heroAbility: SkillWeapon | null = null;
    let bossAbility: string | null = null;
    for (const event of events) {
      if (event.type === "ability") heroAbility = event.weapon;
      if (event.type === "bossAbility") bossAbility = event.bossId;
      const special =
        event.type === "hit" ? (event.attacker === "hero" ? heroAbility : bossAbility) : null;
      this.time.delayedCall(delay, () => this.animate(event, special));
      delay +=
        event.type === "defeated" || event.type === "fled"
          ? 900
          : event.type === "ability" || event.type === "bossAbility"
            ? 600
            : event.type === "manaBurn" || event.type === "drain"
              ? 500
              : 750;
    }
    this.time.delayedCall(delay, () => EventBus.emit("battle:animation-done", { battleId }));
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
    } else if (event.type === "fled") {
      music.stop(this, 0.3);
      this.showFlight(false);
    } else if (event.type === "ability") {
      this.announceHeroAbility(event.weapon);
    } else if (event.type === "poison") {
      const target = this.fighters[event.target];
      this.setHp(event.target, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `☠ -${event.damage}`, "#7dd3a8", 24);
      sfx.poison();
      this.tint(target, 0x7dd3a8, 350);
      fx.rise(this, this.center(event.target), 0x7dd3a8, 8);
    } else if (event.type === "bleed") {
      const target = this.fighters[event.target];
      this.setHp(event.target, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `🩸 -${event.damage}`, "#c23a3a", 24);
      sfx.bleed();
      this.tint(target, 0xc23a3a, 350);
      this.drips(target.homeX, GROUND_Y - 80);
    } else if (event.type === "burn") {
      const target = this.fighters[event.target];
      this.setHp(event.target, Math.max(0, target.hp - event.damage));
      this.floatText(target.homeX, GROUND_Y - 100, `🔥 -${event.damage}`, "#f08a2c", 24);
      sfx.burn();
      this.tint(target, 0xf08a2c, 350);
      fx.rise(this, this.center(event.target), 0xf08a2c, 10);
      fx.rise(this, this.center(event.target), 0xffe28f, 5, 30);
    } else if (event.type === "bossAbility") {
      this.announceBossAbility(event.bossId);
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
    } else if (event.type === "stunned") {
      const enemy = this.fighters.enemy;
      this.floatText(enemy.homeX, GROUND_Y - 120, "BETÄUBT", "#d39bf0", 26);
      sfx.stun();
      this.tweens.add({ targets: enemy.body, angle: 8, duration: 90, yoyo: true, repeat: 3 });
      fx.dizzyStars(this, { x: enemy.homeX, y: GROUND_Y - 150 });
    } else if (event.type === "hit") {
      if (event.attacker === "hero") this.heroHit(event, special as SkillWeapon | null);
      else this.enemyHit(event, special);
    } else if (event.type === "regen") {
      const hero = this.fighters.hero;
      this.setHp("hero", hero.hp + event.heal);
      this.floatText(hero.homeX, GROUND_Y - 105, `+${event.heal}`, "#9dffc8", 22);
      this.sparkles(hero.homeX, GROUND_Y - 60, 0x9dffc8);
    } else {
      music.stop(this, 0.3);
      this.showDefeat(event.side, false);
    }
  }

  /* ───────────── Bausteine für Treffer ───────────── */

  /** Mitte der Figur – Ziel für Geschosse, Strahlen und Effekte. */
  private center(side: Side): fx.Point {
    return { x: this.fighters[side].homeX, y: GROUND_Y - 65 };
  }

  /** Vorderseite der Figur (zum Gegner hin) – Startpunkt für Geschosse. */
  private front(side: Side): fx.Point {
    return { x: this.fighters[side].homeX + (side === "hero" ? 55 : -55), y: GROUND_Y - 75 };
  }

  private tint(f: Fighter, color: number, ms: number) {
    for (const image of f.images) image.setTint(color);
    this.time.delayedCall(ms, () => f.images.forEach((image) => image.clearTint()));
  }

  /** Der Treffer selbst: LP abziehen, Ziel blinkt und wackelt, Schadenszahl. */
  private impact(defenderSide: Side, damage: number, crit: boolean, shake = 0) {
    const defender = this.fighters[defenderSide];
    const dir = defenderSide === "enemy" ? 1 : -1;
    this.setHp(defenderSide, Math.max(0, defender.hp - damage));
    sfx.hit(crit, shake >= 0.012);
    this.tweens.add({ targets: defender.body, alpha: 0.25, duration: 70, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: defender.body, x: defender.homeX + 10 * dir, duration: 60, yoyo: true, repeat: 1 });
    if (crit || shake > 0) this.cameras.main.shake(crit ? 180 : 220, Math.max(shake, crit ? 0.01 : 0));
    if (crit) this.floatText(defender.homeX, GROUND_Y - 110, `KRITISCH! -${damage}`, "#f4c95d", 28);
    else this.floatText(defender.homeX, GROUND_Y - 100, `-${damage}`, "#f0776a", 26);
  }

  /** Ausfallschritt zum Gegner und zurück; `onHit` beim Auftreffen. */
  private lunge(side: Side, onHit: () => void, distance = 90, duration = 140) {
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
  private leapStrike(side: Side, onHit: () => void) {
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
  private announceHeroAbility(weapon: SkillWeapon) {
    const hero = this.fighters.hero;
    const ability = getAbility(weapon);
    this.floatText(hero.homeX, GROUND_Y - 125, `${ability.name}!`, "#f4c95d", 26);
    this.tint(hero, 0xffe28f, 300);
    sfx.ability();
    const at = this.center("hero");
    switch (weapon) {
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
      case "shield": // schützende Kuppel
        this.bulwark?.destroy();
        this.bulwark = fx.dome(this, at);
        sfx.magic();
        break;
      case "bow": // Pfeile zum Himmel richten
        if (hero.weapon) this.tweens.add({ targets: hero.weapon, angle: -35, duration: 220, yoyo: true, hold: 120 });
        fx.rise(this, this.front("hero"), 0xf4c95d, 8, 30);
        sfx.whoosh(0.25);
        break;
    }
  }

  /**
   * Bogenschuss: Sehne spannen, Pfeil fliegt zum Gegner. Beim Pfeilhagel
   * steigt er steil auf und fällt von oben auf das Ziel.
   */
  private shootArrow(target: fx.Point, onHit: () => void, volley = false) {
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
        duration: volley ? 460 : 240,
        arc: volley ? 170 : 16,
        face: true,
        onArrive: () => {
          onHit();
          fx.burst(this, aim, 0xd0d4db, 6, 30, 4);
        },
      });
    });
  }

  private heroHit(event: Extract<BattleEvent, { type: "hit" }>, weapon: SkillWeapon | null) {
    const hit = (shake = 0) => this.impact("enemy", event.damage, event.crit, shake);
    const hero = this.fighters.hero;
    const target = this.center("enemy");
    switch (weapon) {
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
        this.leapStrike("hero", () => {
          hit(0.012);
          fx.cracks(this, target);
          this.floatText(target.x, GROUND_Y - 135, "RÜSTUNG ↓", "#f0776a", 20);
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
        this.shootArrow(target, () => hit(), true);
        break;
      default:
        // Mit dem Bogen wird auch normal geschossen statt zugeschlagen.
        if (this.setup.heroWeapon?.type === "bow") this.shootArrow(target, () => hit());
        else this.lunge("hero", () => hit());
    }
  }

  /* ───────────── Fähigkeiten der Bosse ───────────── */

  private announceBossAbility(bossId: string) {
    const enemy = this.fighters.enemy;
    const ability = getBossAbility(bossId);
    this.floatText(enemy.homeX, GROUND_Y - 130, `${ability?.name ?? "Spezialangriff"}!`, "#f0776a", 28);
    this.tint(enemy, 0xff6b5a, 400);
    this.cameras.main.shake(250, 0.006);
    sfx.roar();
    const at = this.center("enemy");
    switch (bossId) {
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
        fx.rise(this, at, bossId === "high-priestess" ? 0x3ad6c5 : 0xb07cff, 12, 80);
        break;
      case "storm-lord": // Himmel verdunkelt sich
        fx.flash(this, 0x141e36, 0.5, 400);
        break;
      case "ignaroth":
      case "void-lord":
        fx.siphon(this, { x: at.x + 60, y: at.y + 30 }, this.front("enemy"), bossId === "ignaroth" ? 0xf08a2c : 0x5a2a8a);
        break;
    }
  }

  private enemyHit(event: Extract<BattleEvent, { type: "hit" }>, bossId: string | null) {
    const hit = (shake = 0) => this.impact("hero", event.damage, event.crit, shake);
    const target = this.center("hero");
    const enemyAt = this.front("enemy");
    switch (bossId) {
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
        fx.lightning(this, target);
        sfx.thunder();
        this.time.delayedCall(60, () => hit());
        break;
      case "void-lord": // Leerenschlund: Strudel am Helden
        fx.vortex(this, target, [0x5a2a8a, 0x4af0ff]);
        sfx.curse();
        this.time.delayedCall(320, () => hit(0.01));
        break;
      default:
        this.lunge("enemy", () => hit());
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
    const t = this.add
      .text(x, y, text, { fontFamily: NUMBER_FONT, fontSize: `${size}px`, fontStyle: "bold", color })
      .setOrigin(0.5)
      .setStroke("#0e0b16", 5);
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
