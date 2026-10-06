// Phaser-Szene für den Koop-Kampf: 2–4 Helden links, der Koop-Boss rechts.
// Wie die Solo-Szene rechnet sie nichts selbst – sie spielt nur die
// Ereignisse ab, die der Koop-Zustand über den EventBus schickt.

import Phaser from "phaser";
import { getAbility, type AbilityId } from "../domain/abilities";
import { BOSS, getCoopBoss, type CoopBattleState, type CoopEvent } from "../domain/coopCombat";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import type { ItemType } from "../domain/types";
import type { CoopMember } from "../coop/protocol";
import { BG_HEIGHT, BG_SCALE, BG_WIDTH, hasBackground, paintBackground } from "./backgrounds";
import * as fx from "./battleEffects";
import { creatureImage, lastOpaqueRow } from "./creatureImages";
import { getCreatureSprite } from "./creatureSprites";
import { EventBus } from "./EventBus";
import { getHeroSprite, getMainWeapon } from "./heroSprite";
import { music } from "./music";
import { sfx } from "./sfx";
import { paintSprite, renderSprite, type SpriteDef } from "./sprites";

export const COOP_SCENE_WIDTH = 720;
export const COOP_SCENE_HEIGHT = 320;

export interface CoopSceneData {
  state: CoopBattleState;
  members: CoopMember[];
  myId: string;
}

const FONT = '"Pixelify Sans", monospace';
const NUMBER_FONT = '"Inter", sans-serif';
const GROUND_Y = 250;
const BOSS_X = 560;
const HERO_SCALE = 5;
const BOSS_SCALE = 10;
/** Koop-Bosse mit eigenem Bild: deutlich grösser als die Helden */
const BOSS_IMAGE_SCALE = 1.6;
const HERO_BAR = 64;

/** x-Positionen der Helden – der erste steht vorne, nah am Boss. */
const HERO_X: Record<number, number[]> = {
  2: [250, 140],
  3: [270, 180, 90],
  4: [285, 210, 135, 60],
};

const ARROW: SpriteDef = {
  grid: ["tt....L.", ".hhhhhLL", "tt....L."],
  palette: { t: "#e8e1d4", h: "#8a5a2b", L: "#d0d4db" },
};

interface Unit {
  body: Phaser.GameObjects.Container;
  images: Phaser.GameObjects.Image[];
  weapon: Phaser.GameObjects.Image | null;
  weaponType: ItemType | null;
  bar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  homeX: number;
  barWidth: number;
  barY: number;
}

export class CoopBattleScene extends Phaser.Scene {
  private setup!: CoopSceneData;
  private heroes = new Map<string, Unit>();
  private boss!: Unit;

  constructor() {
    super("coop-battle");
  }

  init(data: CoopSceneData) {
    this.setup = data;
    this.heroes = new Map();
  }

  /** Boss mit eigenem Bild (creatureImages.ts) vorab laden. */
  preload() {
    const sprite = getCoopBoss(this.setup.state.bossId).sprite;
    const url = creatureImage(sprite);
    if (url && !this.textures.exists(`creature-img-${sprite}`)) this.load.image(`creature-img-${sprite}`, url);
  }

  create() {
    const { state, members, myId } = this.setup;
    const def = getCoopBoss(state.bossId);
    this.drawBackground(def.areaId);

    const xs = HERO_X[state.heroes.length] ?? HERO_X[4];
    // Hintere Helden zuerst zeichnen, damit die vorderen davor stehen
    [...state.heroes].reverse().forEach((hero) => {
      const index = state.heroes.indexOf(hero);
      const member = members.find((m) => m.id === hero.id);
      this.heroes.set(hero.id, this.addHero(hero.id, xs[index], member, hero.name, hero.combatant.hp, hero.combatant.maxHp, hero.id === myId));
    });
    this.boss = this.addBoss(def.sprite, def.name, def.level, state.boss.hp, state.boss.maxHp);

    // Wer beim (Wieder-)Einstieg schon gefallen ist, liegt am Boden
    for (const hero of state.heroes) if (hero.down) this.fall(hero.id, true);
    if (state.status === "won") this.showBanner("SIEG!", "#f4c95d", true);
    if (state.status === "lost") this.showBanner("NIEDERLAGE", "#f0776a", true);
    if (state.status === "active") music.start(true, this);

    const off = EventBus.on("coop:events", ({ state: next, events }) => {
      if (next.id === this.setup.state.id) this.play(events, next);
    });
    const stopMusic = () => music.stop(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (off(), stopMusic()));
    this.events.once(Phaser.Scenes.Events.DESTROY, () => (off(), stopMusic()));
  }

  /* ───────────── Aufbau ───────────── */

  private drawBackground(areaId: string) {
    if (hasBackground(areaId)) {
      const key = `bg-${areaId}`;
      if (!this.textures.exists(key)) {
        const canvas = this.textures.createCanvas(key, BG_WIDTH, BG_HEIGHT)!;
        paintBackground(canvas.getContext(), areaId);
        canvas.refresh();
      }
      this.add.image(0, 0, key).setOrigin(0).setScale(BG_SCALE).setDepth(-1);
    }
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    for (const x of HERO_X[this.setup.state.heroes.length] ?? HERO_X[4]) g.fillEllipse(x, GROUND_Y + 2, 60, 12);
    g.fillEllipse(BOSS_X, GROUND_Y + 2, 150, 18);
  }

  private texture(key: string, sprite: SpriteDef) {
    const image = renderSprite(sprite);
    if (!this.textures.exists(key)) {
      const canvas = this.textures.createCanvas(key, image.width, image.height)!;
      paintSprite(canvas.getContext(), image);
      canvas.refresh();
    }
    return image;
  }

  /** Figur so auf den Boden stellen, dass die unterste Pixelzeile ihn berührt. */
  private figure(key: string, sprite: SpriteDef) {
    const image = this.texture(key, sprite);
    let lastRow = image.height - 1;
    while (lastRow > 0 && !image.pixels[lastRow].some(Boolean)) lastRow--;
    return { image, lastRow, object: this.add.image(0, 0, key).setOrigin(0.5, (lastRow + 1) / image.height) };
  }

  private addHero(id: string, x: number, member: CoopMember | undefined, name: string, hp: number, maxHp: number, me: boolean): Unit {
    const key = `coop-hero-${id}`;
    const equipment = member?.equipment;
    const bodySprite = equipment ? getHeroSprite(equipment, { withoutMainWeapon: true }) : getHeroSprite(EMPTY_EQUIPMENT);
    const { image, lastRow, object: figure } = this.figure(key, bodySprite);
    const held = equipment ? getMainWeapon(equipment) : null;
    let weapon: Phaser.GameObjects.Image | null = null;
    if (held) {
      const weaponImage = this.texture(`${key}-weapon`, held.sprite);
      weapon = this.add
        .image(held.hand.x + 1.5 - image.width / 2, held.hand.y + 1.5 - (lastRow + 1), `${key}-weapon`)
        .setOrigin((held.grip.x + 1.5) / weaponImage.width, (held.grip.y + 1.5) / weaponImage.height);
    }
    const images = weapon ? (held?.type === "bow" ? [figure, weapon] : [weapon, figure]) : [figure];
    const body = this.add.container(x, GROUND_Y + 4, images).setScale(HERO_SCALE);
    this.tweens.add({ targets: body, y: body.y - 3, duration: 900 + x, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const label = name.length > 11 ? `${name.slice(0, 10)}…` : name;
    this.add
      .text(x, 92, label, { fontFamily: NUMBER_FONT, fontSize: "13px", fontStyle: "bold", color: me ? "#f4c95d" : "#efe6d2" })
      .setOrigin(0.5, 0)
      .setStroke("#0e0b16", 4);
    if (me) this.add.triangle(x, 86, -5, -4, 5, -4, 0, 3, 0xf4c95d).setOrigin(0.5);
    const unit: Unit = {
      body,
      images,
      weapon,
      weaponType: held?.type ?? null,
      bar: this.add.graphics(),
      hpText: this.add
        .text(x, 120, "", { fontFamily: NUMBER_FONT, fontSize: "11px", fontStyle: "bold", color: "#efe6d2" })
        .setOrigin(0.5, 0)
        .setStroke("#0e0b16", 3),
      hp,
      maxHp,
      homeX: x,
      barWidth: HERO_BAR,
      barY: 110,
    };
    this.drawBar(unit, hp);
    return unit;
  }

  private addBoss(spriteKey: string, name: string, level: number, hp: number, maxHp: number): Unit {
    const imageKey = `creature-img-${spriteKey}`;
    let object: Phaser.GameObjects.Image;
    let scale = BOSS_SCALE;
    if (this.textures.exists(imageKey)) {
      const source = this.textures.get(imageKey).getSourceImage() as HTMLImageElement;
      object = this.add.image(0, 0, imageKey).setOrigin(0.5, (lastOpaqueRow(source) + 1) / source.height);
      scale = BOSS_IMAGE_SCALE;
    } else {
      object = this.figure(`creature-${spriteKey}`, getCreatureSprite(spriteKey)).object;
    }
    const body = this.add.container(BOSS_X, GROUND_Y + 4, [object]).setScale(scale);
    this.tweens.add({ targets: body, y: body.y - 4, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .text(BOSS_X, 6, `${name} · Lv. ${level}`, { fontFamily: NUMBER_FONT, fontSize: "17px", fontStyle: "bold", color: "#efe6d2" })
      .setOrigin(0.5, 0)
      .setStroke("#0e0b16", 4);
    const unit: Unit = {
      body,
      images: [object],
      weapon: null,
      weaponType: null,
      bar: this.add.graphics(),
      hpText: this.add
        .text(BOSS_X, 46, "", { fontFamily: NUMBER_FONT, fontSize: "14px", fontStyle: "bold", color: "#efe6d2" })
        .setOrigin(0.5, 0)
        .setStroke("#0e0b16", 4),
      hp,
      maxHp,
      homeX: BOSS_X,
      barWidth: 180,
      barY: 32,
    };
    this.drawBar(unit, hp);
    return unit;
  }

  private drawBar(unit: Unit, hp: number) {
    const ratio = Math.max(0, hp / unit.maxHp);
    const color = ratio > 0.5 ? 0x7dd3a8 : ratio > 0.25 ? 0xf4c95d : 0xf0776a;
    const x = unit.homeX - unit.barWidth / 2;
    unit.bar.clear();
    unit.bar.fillStyle(0x0e0b16).fillRect(x - 2, unit.barY - 2, unit.barWidth + 4, 12);
    unit.bar.fillStyle(0x2e2640).fillRect(x, unit.barY, unit.barWidth, 8);
    unit.bar.fillStyle(color).fillRect(x, unit.barY, Math.round(unit.barWidth * ratio), 8);
    unit.hpText.setText(`${Math.round(hp)} / ${unit.maxHp}`);
  }

  private setHp(unit: Unit, hp: number) {
    const from = { value: unit.hp };
    unit.hp = hp;
    this.tweens.add({ targets: from, value: hp, duration: 350, ease: "Cubic.easeOut", onUpdate: () => this.drawBar(unit, from.value) });
  }

  private unit(id: string): Unit {
    return id === BOSS ? this.boss : this.heroes.get(id)!;
  }

  private center(unit: Unit): fx.Point {
    return { x: unit.homeX, y: GROUND_Y - (unit === this.boss ? 70 : 45) };
  }

  /* ───────────── Ablauf ───────────── */

  /** Ereignisse nacheinander abspielen; Treffer einer Flächenattacke kurz hintereinander. */
  private play(events: CoopEvent[], next: CoopBattleState) {
    let delay = 0;
    let aoe = false;
    for (const event of events) {
      if (event.type === "bossAbility") aoe = getCoopBoss(next.bossId).ability.aoe === true;
      this.time.delayedCall(delay, () => this.animate(event));
      const quick =
        (aoe && ((event.type === "hit" && event.attacker === BOSS) || event.type === "blocked" || event.type === "manaBurn")) ||
        event.type === "drain";
      delay +=
        event.type === "victory" || event.type === "wipe"
          ? 900
          : quick
            ? 260
            : event.type === "ability" || event.type === "bossAbility"
              ? 600
              : event.type === "down"
                ? 500
                : 700;
    }
    this.time.delayedCall(delay + 200, () => EventBus.emit("coop:animation-done", { logLength: next.log.length }));
  }

  private animate(event: CoopEvent) {
    switch (event.type) {
      case "potion": {
        const target = this.unit(event.targetId);
        this.setHp(target, event.revive ? event.heal : target.hp + event.heal);
        if (event.revive) {
          this.standUp(event.targetId);
          this.float(target, "WIEDERBELEBT!", "#7dd3a8", 18, 30);
          sfx.heal();
          fx.pillar(this, this.center(target), 0x9dffc8, 40);
        } else {
          this.float(target, event.buff ? "VERSTÄRKT" : `+${event.heal}`, event.buff ? "#f0776a" : "#7dd3a8", 18);
          if (event.buff) sfx.buff();
          else sfx.heal();
        }
        fx.rise(this, this.center(target), 0x9dffc8, 8, 30);
        break;
      }
      case "ability": {
        const hero = this.unit(event.heroId);
        this.float(hero, `${getAbility(event.ability).name}!`, "#f4c95d", 15, 40);
        this.tint(hero, 0xffe28f, 300);
        sfx.ability();
        this.announceAbility(hero, event.ability);
        break;
      }
      case "hit":
        if (event.attacker === BOSS) this.bossHits(event);
        else this.heroHits(event);
        break;
      case "poison":
      case "burn":
      case "bleed": {
        const target = this.unit(event.target);
        const look = { poison: ["☠", "#7dd3a8", 0x7dd3a8], burn: ["🔥", "#f08a2c", 0xf08a2c], bleed: ["🩸", "#c23a3a", 0xc23a3a] }[event.type];
        this.setHp(target, Math.max(0, target.hp - event.damage));
        this.float(target, `${look[0]} -${event.damage}`, look[1] as string, 16);
        this.tint(target, look[2] as number, 300);
        if (event.type === "poison") sfx.poison();
        else if (event.type === "burn") sfx.burn();
        else sfx.bleed();
        break;
      }
      case "bossAbility": {
        this.float(this.boss, `${event.name}!`, "#f0776a", 24, 60);
        this.tint(this.boss, 0xff6b5a, 400);
        this.cameras.main.shake(250, 0.006);
        sfx.roar();
        // Giftwolke zieht über die ganze Gruppe
        for (const hero of this.heroes.values()) fx.burst(this, this.center(hero), 0x7dd3a8, 10, 50);
        break;
      }
      case "stunned":
        this.float(this.boss, "BETÄUBT", "#d39bf0", 22, 60);
        sfx.stun();
        fx.dizzyStars(this, { x: BOSS_X, y: GROUND_Y - 160 });
        break;
      case "stunResisted":
        this.float(this.boss, "WIDERSTEHT!", "#a49cb8", 20, 60);
        break;
      case "blocked": {
        const hero = this.unit(event.heroId);
        this.float(hero, "GEBLOCKT!", "#7aa7f0", 18, 30);
        sfx.block();
        fx.ring(this, this.center(hero), 0xa9c6ff, 70);
        break;
      }
      case "down":
        this.fall(event.heroId, false);
        break;
      case "victory":
        music.stop(this, 0.3);
        this.tweens.add({ targets: this.boss.body, alpha: 0, scale: this.boss.body.scale * 0.6, y: this.boss.body.y + 20, duration: 600 });
        this.time.delayedCall(250, () => sfx.victory());
        this.showBanner("SIEG!", "#f4c95d", false);
        break;
      case "frozen": {
        const hero = this.unit(event.heroId);
        this.float(hero, "EINGEFROREN", "#9ad9f0", 16, 30);
        this.tint(hero, 0x9ad9f0, 900);
        fx.burst(this, this.center(hero), 0xe8fbff, 14, 40);
        sfx.block();
        break;
      }
      case "skipped": {
        const hero = this.unit(event.heroId);
        this.float(hero, "❄️ setzt aus", "#9ad9f0", 14, 30);
        fx.burst(this, this.center(hero), 0x9ad9f0, 8, 30);
        break;
      }
      case "manaBurn": {
        const hero = this.unit(event.heroId);
        fx.siphon(this, this.center(hero), this.center(this.boss), 0x7aa7f0, 8);
        this.float(hero, `-${event.amount} Mana`, "#7aa7f0", 14, 15);
        sfx.manaBurn();
        break;
      }
      case "selfHeal": {
        const hero = this.unit(event.heroId);
        this.setHp(hero, hero.hp + event.heal);
        this.float(hero, `+${event.heal}`, "#9dffc8", 16, 20);
        fx.rise(this, this.center(hero), 0x9dffc8, 8, 30);
        sfx.heal();
        break;
      }
      case "guarded": {
        const hero = this.unit(event.heroId);
        this.float(hero, "ABGEWEHRT", "#a9c6ff", 14, 30);
        fx.ring(this, this.center(hero), 0xa9c6ff, 45);
        sfx.block();
        break;
      }
      case "counter":
        this.setHp(this.boss, Math.max(0, this.boss.hp - event.damage));
        this.float(this.boss, `↺ -${event.damage}`, "#f4c95d", 22);
        fx.slashes(this, this.center(this.boss), 0xf4c95d, 2);
        sfx.hit(true);
        break;
      case "regen": {
        const hero = this.unit(event.heroId);
        this.setHp(hero, hero.hp + event.heal);
        this.float(hero, `+${event.heal}`, "#9dffc8", 16, 20);
        fx.rise(this, this.center(hero), 0x9dffc8, 6, 30);
        break;
      }
      case "drain":
        this.setHp(this.boss, this.boss.hp + event.heal);
        this.float(this.boss, `+${event.heal}`, "#b07cff", 20, 40);
        this.tint(this.boss, 0xd39bf0, 300);
        sfx.drain();
        break;
      case "wipe":
        music.stop(this, 0.3);
        this.time.delayedCall(250, () => sfx.defeat());
        this.showBanner("NIEDERLAGE", "#f0776a", false);
        break;
    }
  }

  /** Angriff eines Helden – Form nach Waffe: Pfeil, Feuerball, Strahl oder Nahkampf. */
  /** Vorbereitung einer Fähigkeit – bei den zweiten Fähigkeiten jeweils eigene. */
  private announceAbility(hero: Unit, id: AbilityId) {
    const at = this.center(hero);
    switch (id) {
      case "shield":
        fx.ring(this, at, 0xa9c6ff, 50);
        break;
      case "dagger-2":
        fx.burst(this, { x: at.x + 8, y: at.y - 20 }, 0xff3a3a, 6, 16, 3);
        break;
      case "sword-2":
        fx.ring(this, at, 0xdde6ff, 35, 300);
        sfx.block();
        break;
      case "greatsword-2":
        for (let i = 0; i < 3; i++) this.time.delayedCall(i * 110, () => fx.ring(this, at, 0xf08a2c, 50 + i * 22, 400));
        this.cameras.main.shake(220, 0.005);
        sfx.roar();
        break;
      case "axe-2":
        fx.rise(this, at, 0xc23a3a, 6, 36);
        break;
      case "greataxe-2":
        this.tint(hero, 0xff4a4a, 600);
        fx.ring(this, at, 0xc23a3a, 45, 380);
        break;
      case "mace-2":
        fx.pillar(this, at, 0xffe9a0, 55);
        sfx.heal();
        break;
      case "greathammer-2":
        this.tweens.add({ targets: hero.body, y: hero.body.y - 14, duration: 180, yoyo: true });
        break;
      case "scepter-2":
        fx.curseRing(this, at, 0x8a4ad0, () => {});
        sfx.curse();
        break;
      case "staff-2":
        fx.flash(this, 0x5a1408, 0.4, 450);
        sfx.magic();
        break;
      case "bow-2":
        fx.ring(this, this.center(this.boss), 0xff5a5a, 40, 500);
        break;
      case "shield-2":
        fx.ring(this, at, 0xf4c95d, 45);
        this.tint(hero, 0xffe28f, 500);
        sfx.block();
        break;
    }
  }

  /** Eigene Treffer-Animation der zweiten Fähigkeiten – false, wenn es keine gibt. */
  private abilityHit(hero: Unit, id: AbilityId, from: fx.Point, target: fx.Point, hit: () => void, crit: boolean): boolean {
    const dash = (onHit: () => void) => {
      sfx.swing();
      if (hero.weapon) this.swing(hero.weapon);
      this.tweens.add({ targets: hero.body, x: hero.homeX + 70, duration: 120, ease: "Quad.easeIn", yoyo: true, onYoyo: onHit });
    };
    switch (id) {
      case "dagger-2":
        dash(() => {
          hit();
          fx.slashes(this, target, 0xff3a3a, 1);
          fx.slashes(this, target, 0xff3a3a, 1, true);
          fx.burst(this, target, 0xc23a3a, 14, 60, 5);
        });
        return true;
      case "sword-2":
        dash(() => {
          hit();
          fx.slashes(this, target, 0xdde6ff, 1, true);
          this.time.delayedCall(150, () => this.tint(hero, 0xa9c6ff, 450));
        });
        return true;
      case "greatsword-2":
        dash(() => {
          hit();
          fx.ring(this, target, 0xf08a2c, 70, 360);
        });
        return true;
      case "axe-2":
        dash(() => {
          hit();
          fx.slashes(this, target, 0xc23a3a, 3, crit);
        });
        return true;
      case "greataxe-2":
        dash(() => {
          hit();
          fx.siphon(this, target, this.center(hero), 0xc23a3a, 10);
          sfx.drain();
        });
        return true;
      case "mace-2":
        dash(() => {
          hit();
          fx.burst(this, target, 0xffe9a0, 10, 45);
        });
        return true;
      case "greathammer-2":
        this.cameras.main.shake(450, 0.01);
        sfx.quake(0.5);
        fx.groundWave(this, { x: hero.homeX + 30, y: GROUND_Y }, { x: target.x, y: GROUND_Y }, 0x8a7a60, 380, () => {
          hit();
          fx.cracks(this, target);
        });
        return true;
      case "scepter-2":
        sfx.curse();
        fx.beam(this, from, target, 0x8a4ad0, 9, 400);
        this.time.delayedCall(160, () => {
          hit();
          fx.ring(this, target, 0x8a4ad0, 55, 480);
        });
        return true;
      case "staff-2": {
        sfx.fire(0.5);
        const meteor = this.add.circle(0, 0, 22, 0xc23a3a).setStrokeStyle(5, 0xf08a2c);
        fx.projectile(this, { x: target.x + 140, y: -40 }, target, meteor, {
          duration: 500,
          arc: 0,
          trail: 0xf08a2c,
          onArrive: () => {
            hit();
            fx.burst(this, target, 0xf08a2c, 26, 110, 8);
            fx.ring(this, { x: target.x, y: GROUND_Y }, 0xffe28f, 130, 480, true);
            this.cameras.main.shake(300, 0.012);
            sfx.explosion();
          },
        });
        return true;
      }
      case "bow-2": {
        this.texture("arrow", ARROW);
        sfx.bowShot();
        fx.beam(this, from, target, 0xffe28f, 3, 240);
        const arrow = this.add.image(0, 0, "arrow").setScale(4);
        fx.projectile(this, from, target, arrow, {
          duration: 180,
          arc: 0,
          face: true,
          onArrive: () => {
            hit();
            fx.burst(this, target, 0xc23a3a, 10, 50);
          },
        });
        return true;
      }
      default:
        return false;
    }
  }

  private heroHits(event: Extract<CoopEvent, { type: "hit" }>) {
    const hero = this.unit(event.attacker);
    const target = this.center(this.boss);
    const hit = () => this.impact(this.boss, event.damage, event.crit);
    const from = { x: hero.homeX + 30, y: GROUND_Y - 50 };
    if (event.ability && this.abilityHit(hero, event.ability, from, target, hit, event.crit)) return;
    const kind = event.weapon ?? hero.weaponType;
    if (kind === "bow") {
      this.texture("arrow", ARROW);
      sfx.bowShot();
      const arrow = this.add.image(0, 0, "arrow").setScale(4);
      fx.projectile(this, from, target, arrow, { duration: 300, arc: event.weapon ? 120 : 20, face: true, onArrive: hit });
    } else if (kind === "staff") {
      sfx.fire(0.3);
      const ball = this.add.circle(0, 0, 12, 0xf08a2c).setStrokeStyle(4, 0xffe28f);
      fx.projectile(this, from, target, ball, { duration: 320, arc: 20, trail: 0xc23a3a, onArrive: () => (hit(), sfx.explosion()) });
    } else if (kind === "scepter") {
      sfx.beam();
      fx.beam(this, from, target, 0x7dd3a8, 10, 380);
      this.time.delayedCall(160, hit);
    } else {
      sfx.swing();
      if (hero.weapon) this.swing(hero.weapon);
      this.tweens.add({ targets: hero.body, x: hero.homeX + 60, duration: 130, ease: "Quad.easeIn", yoyo: true, onYoyo: hit });
    }
  }

  /** Der Boss stürzt sich auf sein Ziel (bei Flächenangriffen schlägt er nur zu). */
  private bossHits(event: Extract<CoopEvent, { type: "hit" }>) {
    const target = this.unit(event.target);
    const hit = () => this.impact(target, event.damage, event.crit);
    sfx.swing();
    const reach = Math.max(40, BOSS_X - target.homeX - 150);
    this.tweens.add({ targets: this.boss.body, x: BOSS_X - reach, duration: 160, ease: "Quad.easeIn", yoyo: true, onYoyo: hit });
  }

  private impact(unit: Unit, damage: number, crit: boolean) {
    this.setHp(unit, Math.max(0, unit.hp - damage));
    sfx.hit(crit, false);
    const dir = unit === this.boss ? 1 : -1;
    this.tweens.add({ targets: unit.body, alpha: 0.3, duration: 70, yoyo: true, repeat: 1 });
    this.tweens.add({ targets: unit.body, x: unit.homeX + 8 * dir, duration: 60, yoyo: true });
    if (crit) this.cameras.main.shake(160, 0.008);
    this.float(unit, crit ? `KRITISCH! -${damage}` : `-${damage}`, crit ? "#f4c95d" : "#f0776a", crit ? 20 : 18);
  }

  private swing(weapon: Phaser.GameObjects.Image) {
    this.tweens.killTweensOf(weapon);
    this.tweens.chain({
      targets: weapon,
      tweens: [
        { angle: -45, duration: 70, ease: "Quad.easeOut" },
        { angle: 110, duration: 60, ease: "Quad.easeIn" },
        { angle: 0, duration: 220, ease: "Back.easeOut", delay: 60 },
      ],
    });
  }

  private fall(id: string, instant: boolean) {
    const hero = this.heroes.get(id);
    if (!hero) return;
    this.tweens.killTweensOf(hero.body);
    this.tweens.add({ targets: hero.body, angle: -90, alpha: 0.45, y: GROUND_Y + 4, duration: instant ? 0 : 500 });
    if (!instant) this.float(hero, "GEFALLEN", "#a49cb8", 16, 30);
  }

  private standUp(id: string) {
    const hero = this.heroes.get(id);
    if (!hero) return;
    this.tweens.killTweensOf(hero.body);
    this.tweens.add({ targets: hero.body, angle: 0, alpha: 1, duration: 400, ease: "Back.easeOut" });
  }

  private tint(unit: Unit, color: number, ms: number) {
    for (const image of unit.images) image.setTint(color);
    this.time.delayedCall(ms, () => unit.images.forEach((image) => image.clearTint()));
  }

  private float(unit: Unit, text: string, color: string, size: number, lift = 0) {
    const y = GROUND_Y - (unit === this.boss ? 120 : 95) - lift;
    const t = this.add
      .text(unit.homeX, y, text, { fontFamily: NUMBER_FONT, fontSize: `${size}px`, fontStyle: "bold", color })
      .setOrigin(0.5)
      .setStroke("#0e0b16", 5)
      .setDepth(30);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1000, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private showBanner(text: string, color: string, instant: boolean) {
    const banner = this.add
      .text(COOP_SCENE_WIDTH / 2, 150, text, { fontFamily: FONT, fontSize: "56px", color })
      .setOrigin(0.5)
      .setStroke("#0e0b16", 8)
      .setDepth(40)
      .setScale(instant ? 1 : 0.2);
    if (!instant) this.tweens.add({ targets: banner, scale: 1, duration: 450, ease: "Back.easeOut", delay: 250 });
  }
}
