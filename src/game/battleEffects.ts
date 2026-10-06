// Effekt-Bausteine für die Kampfszene: Geschosse, Strahlen, Blitze,
// Schockwellen und Partikel im Pixel-Look (nur Rechtecke, keine Weichzeichner).
// Die Fähigkeiten in BattleScene.ts setzen sich aus diesen Bausteinen zusammen.

import Phaser from "phaser";

export interface Point {
  x: number;
  y: number;
}

const rnd = Phaser.Math.Between;

/** Pixel fliegen von einem Punkt in alle Richtungen auseinander. */
export function burst(scene: Phaser.Scene, at: Point, color: number, count = 14, spread = 60, size = 6) {
  for (let i = 0; i < count; i++) {
    const p = scene.add.rectangle(at.x, at.y, size, size, color).setDepth(20);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = spread * (0.5 + Math.random() * 0.6);
    scene.tweens.add({
      targets: p,
      x: at.x + Math.cos(angle) * dist,
      y: at.y + Math.sin(angle) * dist,
      alpha: 0,
      scale: 0.3,
      duration: rnd(350, 550),
      ease: "Cubic.easeOut",
      onComplete: () => p.destroy(),
    });
  }
}

/** Kleine Pixel steigen auf (Gift-Blasen, Funken, Seelen …). */
export function rise(scene: Phaser.Scene, at: Point, color: number, count = 8, width = 50) {
  for (let i = 0; i < count; i++) {
    const p = scene.add.rectangle(at.x + rnd(-width / 2, width / 2), at.y + rnd(-10, 30), 5, 5, color).setDepth(20);
    scene.tweens.add({
      targets: p,
      y: p.y - rnd(40, 80),
      alpha: 0,
      duration: rnd(450, 750),
      delay: rnd(0, 150),
      onComplete: () => p.destroy(),
    });
  }
}

/**
 * Ein Geschoss fliegt von `from` nach `to` und ruft bei der Ankunft `onArrive`.
 * Unterwegs hinterlässt es auf Wunsch eine Spur aus Pixeln.
 */
export function projectile(
  scene: Phaser.Scene,
  from: Point,
  to: Point,
  object: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  options: {
    duration?: number;
    spin?: number;
    arc?: number;
    trail?: number;
    /** Spitze zeigt in Flugrichtung (Pfeile) – statt `spin` */
    face?: boolean;
    onArrive: () => void;
  },
) {
  const { duration = 320, spin = 0, arc = 0, trail, face = false, onArrive } = options;
  const progress = { t: 0 };
  (object as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(20);
  scene.tweens.add({
    targets: progress,
    t: 1,
    duration,
    ease: "Quad.easeIn",
    onUpdate: () => {
      const { t } = progress;
      object.x = from.x + (to.x - from.x) * t;
      // Bogenflug: Parabel nach oben
      object.y = from.y + (to.y - from.y) * t - arc * Math.sin(Math.PI * t);
      if (face) {
        const vy = to.y - from.y - arc * Math.PI * Math.cos(Math.PI * t);
        object.angle = Phaser.Math.RadToDeg(Math.atan2(vy, to.x - from.x));
      } else object.angle = spin * t;
      if (trail !== undefined && Math.random() < 0.7) {
        const p = scene.add.rectangle(object.x, object.y + rnd(-6, 6), 6, 6, trail).setDepth(19);
        scene.tweens.add({ targets: p, alpha: 0, scale: 0.2, duration: 300, onComplete: () => p.destroy() });
      }
    },
    onComplete: () => {
      object.destroy();
      onArrive();
    },
  });
}

/** Ein Strahl baut sich von `from` nach `to` auf und verblasst wieder. */
export function beam(scene: Phaser.Scene, from: Point, to: Point, color: number, width = 10, duration = 380) {
  const g = scene.add.graphics().setDepth(18);
  const draw = (reach: number, alpha: number) => {
    g.clear();
    const x = from.x + (to.x - from.x) * reach;
    const y = from.y + (to.y - from.y) * reach;
    g.lineStyle(width, color, alpha).lineBetween(from.x, from.y, x, y);
    g.lineStyle(Math.max(2, width / 3), 0xffffff, alpha * 0.8).lineBetween(from.x, from.y, x, y);
  };
  const state = { reach: 0, alpha: 1 };
  scene.tweens.chain({
    targets: state,
    tweens: [
      { reach: 1, duration: duration * 0.4, ease: "Quad.easeOut", onUpdate: () => draw(state.reach, state.alpha) },
      { alpha: 0, duration: duration * 0.6, onUpdate: () => draw(state.reach, state.alpha) },
    ],
    onComplete: () => g.destroy(),
  });
}

/** Zickzack-Blitz von oben auf einen Punkt, mit kurzem weissen Aufblitzen der Szene. */
export function lightning(scene: Phaser.Scene, target: Point, color = 0xffe66b) {
  const g = scene.add.graphics().setDepth(21);
  const points: Point[] = [{ x: target.x + rnd(-30, 30), y: 0 }];
  while (points.at(-1)!.y < target.y - 20) {
    const last = points.at(-1)!;
    points.push({ x: last.x + rnd(-28, 28), y: last.y + rnd(25, 45) });
  }
  points.push(target);
  for (const [width, c] of [
    [10, color],
    [4, 0xffffff],
  ] as const) {
    g.lineStyle(width, c, 1);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: 350, delay: 80, onComplete: () => g.destroy() });
  flash(scene, 0xffffff, 0.35);
}

/** Kurzes Aufleuchten der ganzen Szene. */
export function flash(scene: Phaser.Scene, color: number, alpha = 0.3, duration = 180) {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(width / 2, height / 2, width, height, color, alpha).setDepth(30);
  scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() });
}

/** Ein Ring breitet sich aus (Schockwelle, Explosion). */
export function ring(scene: Phaser.Scene, at: Point, color: number, radius = 80, duration = 420, flat = false) {
  const g = scene.add.graphics().setDepth(17);
  const state = { r: 6, alpha: 1 };
  scene.tweens.add({
    targets: state,
    r: radius,
    alpha: 0,
    duration,
    ease: "Cubic.easeOut",
    onUpdate: () => {
      g.clear().lineStyle(6, color, state.alpha);
      if (flat) g.strokeEllipse(at.x, at.y, state.r * 2, state.r * 0.5);
      else g.strokeCircle(at.x, at.y, state.r);
    },
    onComplete: () => g.destroy(),
  });
}

/** Schockwelle läuft am Boden von `from` nach `to`, mit hochgeschleuderten Steinchen. */
export function groundWave(scene: Phaser.Scene, from: Point, to: Point, color: number, duration = 380, onArrive?: () => void) {
  const state = { t: 0 };
  scene.tweens.add({
    targets: state,
    t: 1,
    duration,
    onUpdate: () => {
      if (Math.random() < 0.8) {
        const x = from.x + (to.x - from.x) * state.t;
        const p = scene.add.rectangle(x + rnd(-8, 8), from.y, 8, 8, color).setDepth(16);
        scene.tweens.add({
          targets: p,
          y: from.y - rnd(20, 50),
          alpha: 0,
          duration: 380,
          ease: "Quad.easeOut",
          onComplete: () => p.destroy(),
        });
      }
    },
    onComplete: () => onArrive?.(),
  });
}

/** Schräge Krallen-/Schnittspuren über einem Ziel. */
export function slashes(scene: Phaser.Scene, at: Point, color: number, count = 3, reverse = false) {
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setDepth(22);
    const offset = (i - (count - 1) / 2) * 18;
    const dir = reverse ? -1 : 1;
    g.lineStyle(7, color, 1).lineBetween(at.x - 40 * dir + offset, at.y - 45, at.x + 40 * dir + offset, at.y + 35);
    g.lineStyle(2, 0xffffff, 1).lineBetween(at.x - 40 * dir + offset, at.y - 45, at.x + 40 * dir + offset, at.y + 35);
    g.setAlpha(0);
    scene.tweens.chain({
      targets: g,
      tweens: [
        { alpha: 1, duration: 40, delay: i * 70 },
        { alpha: 0, duration: 300 },
      ],
      onComplete: () => g.destroy(),
    });
  }
}

/** Kreisförmiger Hieb um einen Punkt (Schwertwirbel). */
export function whirl(scene: Phaser.Scene, at: Point, color = 0xffffff) {
  const g = scene.add.graphics().setDepth(22);
  const state = { a: 0 };
  scene.tweens.add({
    targets: state,
    a: Math.PI * 2,
    duration: 360,
    onUpdate: () => {
      g.clear().lineStyle(6, color, 0.9);
      g.beginPath();
      g.arc(at.x, at.y, 70, state.a - 1.4, state.a);
      g.strokePath();
    },
    onComplete: () => {
      scene.tweens.add({ targets: g, alpha: 0, duration: 150, onComplete: () => g.destroy() });
    },
  });
}

/** Leuchtsäule von oben auf ein Ziel (Richterstoss). */
export function pillar(scene: Phaser.Scene, at: Point, color: number, width = 70) {
  const column = scene.add.rectangle(at.x, 0, width, 0, color, 0.55).setOrigin(0.5, 0).setDepth(16);
  const core = scene.add.rectangle(at.x, 0, width / 3, 0, 0xffffff, 0.8).setOrigin(0.5, 0).setDepth(16);
  const height = at.y + 70;
  scene.tweens.chain({
    targets: [column, core],
    tweens: [
      { height, duration: 180, ease: "Quad.easeIn" },
      { alpha: 0, duration: 350, delay: 120 },
    ],
    onComplete: () => {
      column.destroy();
      core.destroy();
    },
  });
}

/** Steine fallen von oben auf ein Ziel. */
export function rockfall(scene: Phaser.Scene, at: Point, colors: number[], onLand: () => void) {
  let landed = false;
  for (let i = 0; i < 7; i++) {
    const size = rnd(12, 24);
    const rock = scene.add
      .rectangle(at.x + rnd(-50, 50), -30 - rnd(0, 60), size, size, colors[i % colors.length])
      .setDepth(21)
      .setStrokeStyle(3, 0x1b1424);
    scene.tweens.add({
      targets: rock,
      y: at.y + rnd(-20, 30),
      angle: rnd(-90, 90),
      duration: rnd(260, 380),
      delay: i * 30,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (!landed) {
          landed = true;
          onLand();
        }
        burst(scene, { x: rock.x, y: rock.y }, colors[0], 5, 25, 5);
        rock.destroy();
      },
    });
  }
}

/** Feuerstrom aus vielen Flammen-Pixeln von `from` nach `to`. */
export function fireStream(scene: Phaser.Scene, from: Point, to: Point, duration = 420) {
  const colors = [0xffe28f, 0xf08a2c, 0xc23a3a, 0xff5a3c];
  const timer = scene.time.addEvent({
    delay: 18,
    repeat: Math.floor(duration / 18),
    callback: () => {
      const size = rnd(8, 16);
      const p = scene.add.rectangle(from.x, from.y + rnd(-6, 6), size, size, colors[rnd(0, colors.length - 1)]);
      p.setDepth(20);
      scene.tweens.add({
        targets: p,
        x: to.x + rnd(-20, 20),
        y: to.y + rnd(-30, 30),
        scale: 1.6,
        alpha: 0,
        duration: 320,
        onComplete: () => p.destroy(),
      });
    },
  });
  scene.time.delayedCall(duration + 50, () => timer.remove());
}

/** Teilchen werden von `from` zu `to` gezogen (Lebens-/Manaraub, Sog). */
export function siphon(scene: Phaser.Scene, from: Point, to: Point, color: number, count = 10) {
  for (let i = 0; i < count; i++) {
    const p = scene.add.rectangle(from.x + rnd(-30, 30), from.y + rnd(-40, 40), 7, 7, color).setDepth(20);
    scene.tweens.add({
      targets: p,
      x: to.x + rnd(-10, 10),
      y: to.y + rnd(-10, 10),
      duration: rnd(380, 520),
      delay: i * 25,
      ease: "Cubic.easeIn",
      onComplete: () => p.destroy(),
    });
  }
}

/** Ein Ring aus Zeichen kreist um ein Ziel und zieht sich zusammen (Fluch). */
export function curseRing(scene: Phaser.Scene, at: Point, color: number, onDone: () => void) {
  const runes = Array.from({ length: 8 }, () =>
    scene.add.rectangle(at.x, at.y, 9, 14, color).setDepth(22).setStrokeStyle(2, 0x1b1424),
  );
  const state = { a: 0, r: 85 };
  scene.tweens.add({
    targets: state,
    a: Math.PI * 2,
    r: 10,
    duration: 480,
    ease: "Quad.easeIn",
    onUpdate: () =>
      runes.forEach((rune, i) => {
        const angle = state.a + (Math.PI * 2 * i) / runes.length;
        rune.setPosition(at.x + Math.cos(angle) * state.r, at.y + Math.sin(angle) * state.r * 0.6);
      }),
    onComplete: () => {
      runes.forEach((r) => r.destroy());
      burst(scene, at, color, 12, 50);
      onDone();
    },
  });
}

/** Dunkler Strudel über einem Ziel (Leerenschlund). */
export function vortex(scene: Phaser.Scene, at: Point, colors: [number, number], duration = 480) {
  const g = scene.add.graphics().setDepth(17);
  const state = { a: 0, s: 0.2 };
  scene.tweens.add({
    targets: state,
    a: Math.PI * 4,
    s: 1,
    duration,
    onUpdate: () => {
      g.clear();
      for (let i = 0; i < 4; i++) {
        g.lineStyle(6, colors[i % 2], 0.85);
        g.beginPath();
        g.arc(at.x, at.y, (20 + i * 16) * state.s, state.a + i, state.a + i + 2.2);
        g.strokePath();
      }
    },
    onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }),
  });
}

/** Sterne kreisen über dem Kopf (Betäubung). */
export function dizzyStars(scene: Phaser.Scene, at: Point, duration = 900) {
  const stars = Array.from({ length: 4 }, () => scene.add.star(at.x, at.y, 5, 4, 9, 0xffe66b).setDepth(22));
  const state = { a: 0 };
  scene.tweens.add({
    targets: state,
    a: Math.PI * 4,
    duration,
    onUpdate: () =>
      stars.forEach((s, i) => {
        const angle = state.a + (Math.PI * 2 * i) / stars.length;
        s.setPosition(at.x + Math.cos(angle) * 40, at.y + Math.sin(angle) * 10);
      }),
    onComplete: () => stars.forEach((s) => s.destroy()),
  });
}

/** Risse im Ziel (Spalter): dunkle Zickzack-Linien, die kurz stehen bleiben. */
export function cracks(scene: Phaser.Scene, at: Point) {
  const g = scene.add.graphics().setDepth(22);
  g.lineStyle(5, 0x1b1424, 1);
  for (let i = 0; i < 3; i++) {
    let x = at.x + rnd(-20, 20);
    let y = at.y - 50;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += rnd(-15, 15);
      y += rnd(18, 28);
      g.lineTo(x, y);
    }
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: 500, delay: 300, onComplete: () => g.destroy() });
}

/** Schützende Kuppel um den Helden (Bollwerk) – bleibt bis zum Block bestehen. */
export function dome(scene: Phaser.Scene, at: Point): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(15);
  g.fillStyle(0x7aa7f0, 0.18).fillEllipse(at.x, at.y, 170, 190);
  g.lineStyle(5, 0xa9c6ff, 0.9).strokeEllipse(at.x, at.y, 170, 190);
  g.setScale(0.2).setPosition(0, 0);
  // Skalieren um die Kuppelmitte: Container-loses Graphics → Position nachführen
  const state = { s: 0.2 };
  scene.tweens.add({
    targets: state,
    s: 1,
    duration: 260,
    ease: "Back.easeOut",
    onUpdate: () => g.setScale(state.s).setPosition(at.x * (1 - state.s), at.y * (1 - state.s)),
  });
  scene.tweens.add({ targets: g, alpha: 0.6, duration: 700, yoyo: true, repeat: -1, delay: 300 });
  return g;
}
