// Pixel-Art-Hintergründe der Kampfszene – einer pro Gebiet bzw. Dungeon.
// Gemalt wird auf eine kleine Leinwand (BG_WIDTH × BG_HEIGHT), die die Szene
// um BG_SCALE vergrössert. Alles entsteht im Code aus wenigen Bausteinen
// (Farbverlauf mit Dithering, Bergketten, Bäume, Säulen …). Der Zufall ist
// fest pro Gebiet, damit jeder Ort immer gleich aussieht.

export const BG_SCALE = 4;
export const BG_WIDTH = 180;
export const BG_HEIGHT = 80;
/** Erste Bodenzeile – die Kämpfer stehen knapp darunter (GROUND_Y / BG_SCALE). */
export const BG_GROUND = 60;
/** Das Dorfbild ist breiter, damit alle sieben Gebäude nebeneinander Platz haben. */
export const VILLAGE_WIDTH = 300;

type Painter = (p: Canvas) => void;

/** Deterministischer Zufall (mulberry32) – gleicher Ort, gleiches Bild. */
function seeded(seed: string): () => number {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2654435761), 1779033703) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4×4-Bayer-Matrix für geordnetes Dithering (Werte 0–15). */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Kleine Malschicht über dem Canvas-Kontext mit Pixel-Bausteinen. */
class Canvas {
  readonly rnd: () => number;
  constructor(
    private ctx: CanvasRenderingContext2D,
    seed: string,
    /** Breite der Leinwand – das Dorf ist breiter als die Kampfszene */
    readonly width = BG_WIDTH,
  ) {
    this.rnd = seeded(seed);
  }

  /** Ganzzahl in [min, max] */
  int(min: number, max: number) {
    return min + Math.floor(this.rnd() * (max - min + 1));
  }

  px(x: number, y: number, color: string) {
    if (x < 0 || y < 0 || x >= this.width || y >= BG_HEIGHT) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Vertikaler Verlauf über mehrere Farben, Übergänge gedithert (Pixel-Look statt weich). */
  gradient(top: number, bottom: number, colors: string[]) {
    const span = bottom - top;
    for (let y = top; y < bottom; y++) {
      const t = ((y - top) / span) * (colors.length - 1);
      const i = Math.min(colors.length - 2, Math.floor(t));
      const f = t - i;
      for (let x = 0; x < this.width; x++) {
        this.px(x, y, f * 16 > BAYER[y % 4][x % 4] ? colors[i + 1] : colors[i]);
      }
    }
  }

  /**
   * Nebelschwade: halbtransparentes Band mit welligem Rand, zur Mitte hin
   * dichter. `density` 1–10 bestimmt die Deckkraft.
   */
  haze(y: number, height: number, color: string, density = 6) {
    const phase = this.rnd() * 10;
    const alpha = Math.min(1, density / 16);
    for (let x = 0; x < this.width; x++) {
      const wobble = Math.round(Math.sin(x / 9 + phase) * 1.5 + Math.sin(x / 4 + phase * 2) * 0.7);
      const top = y + wobble;
      const bottom = y + height - wobble;
      for (let yy = top; yy < bottom; yy++) {
        const edge = Math.min(yy - top + 1, bottom - yy) / ((bottom - top) / 2);
        this.ctx.globalAlpha = alpha * Math.min(1, edge * 1.5);
        this.px(x, yy, color);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  /**
   * Hügel- oder Bergkette: Höhe aus überlagerten Wellen plus Zufall, darunter
   * bis zum Boden gefüllt. `peaky` macht spitze Gipfel. Gibt die Kammhöhen zurück.
   */
  ridge(base: number, amp: number, color: string, opts: { freq?: number; peaky?: boolean; to?: number } = {}) {
    const { freq = 1, peaky = false, to = BG_GROUND } = opts;
    const phase = this.rnd() * 100;
    const heights: number[] = [];
    for (let x = 0; x < this.width; x++) {
      let w = Math.sin((x / 23) * freq + phase) * 0.6 + Math.sin((x / 9) * freq + phase * 2) * 0.3;
      if (peaky) w = 1 - Math.abs(Math.sin((x / 28) * freq + phase)) * 2 + Math.sin(x / 5 + phase) * 0.15;
      const h = Math.round(base - w * amp - this.rnd() * 1.2);
      heights.push(h);
      this.rect(x, h, 1, to - h, color);
    }
    return heights;
  }

  /** Gefüllter Kreis (Mond, Sonne, Felsen). */
  circle(cx: number, cy: number, r: number, color: string) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, color);
  }

  /** Tanne aus gestuften Dreiecken; `snow` legt Schnee auf die Äste. */
  pine(x: number, base: number, height: number, color: string, opts: { trunk?: string; snow?: string } = {}) {
    if (opts.trunk) this.rect(x, base - 2, 1, 2, opts.trunk);
    const tiers = Math.max(2, Math.round(height / 4));
    for (let t = 0; t < tiers; t++) {
      const top = base - height + t * (height / tiers) * 0.8;
      const rows = Math.round(height / tiers) + 1;
      for (let r = 0; r < rows; r++) {
        const half = Math.round(((r + 1) / rows) * (1 + t * 0.9));
        this.rect(x - half, top + r, half * 2 + 1, 1, color);
        if (opts.snow && r === 0) this.rect(x - half, top + r, half * 2 + 1, 1, opts.snow);
      }
    }
  }

  /** Kahler Baum: Stamm mit ein paar schrägen Ästen. */
  deadTree(x: number, base: number, height: number, color: string) {
    this.rect(x, base - height, 1, height, color);
    this.rect(x - 1, base - 2, 3, 2, color);
    for (let i = 0; i < 4; i++) {
      const y = base - height + 2 + i * Math.round(height / 5);
      const dir = i % 2 === 0 ? 1 : -1;
      const len = this.int(2, 5);
      for (let k = 1; k <= len; k++) this.px(x + dir * k, y - Math.floor(k / 2), color);
    }
  }

  /** Lichtschein: gedithert, nach aussen dünner (Laternen, Kristalle, Lava). */
  glow(cx: number, cy: number, r: number, color: string) {
    [cx, cy, r] = [Math.round(cx), Math.round(cy), Math.round(r)];
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y) / r;
        if (d <= 1 && BAYER[(cy + y + 64) % 4][(cx + x + 64) % 4] < (1 - d) * 9) this.px(cx + x, cy + y, color);
      }
  }

  /** Bodenstreifen ab BG_GROUND: Oberkante, Schichten und Sprenkel. */
  ground(top: string, layers: string[], speckle: string[], count = 70) {
    this.gradient(BG_GROUND, BG_HEIGHT, layers);
    this.rect(0, BG_GROUND, this.width, 1, top);
    for (let i = 0; i < count; i++) this.px(this.int(0, this.width), this.int(BG_GROUND + 2, BG_HEIGHT), speckle[i % speckle.length]);
  }

  /** Zufällige Einzelpixel im Bereich (Sterne, Funken, Glühwürmchen). */
  scatter(n: number, area: [number, number, number, number], colors: string[]) {
    const [x0, y0, x1, y1] = area;
    for (let i = 0; i < n; i++) this.px(this.int(x0, x1), this.int(y0, y1), colors[i % colors.length]);
  }
}

/* ───────────── Gebiete ───────────── */

const darkwood: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#0f1a16", "#152620", "#1d3328", "#27402f"]);
  p.circle(140, 13, 6, "#d9e6c8");
  p.circle(142, 12, 6, "#152620"); // Sichel
  p.scatter(18, [0, 0, BG_WIDTH, 25], ["#3c5a46", "#577a5e"]);
  // Drei Tannenreihen: je näher, desto dunkler und grösser
  for (let x = -4; x < BG_WIDTH + 4; x += p.int(5, 8)) p.pine(x, 46, p.int(14, 20), "#1f3a2c");
  p.haze(38, 8, "#2f4d3a", 3);
  for (let x = -6; x < BG_WIDTH + 6; x += p.int(8, 12)) p.pine(x, 54, p.int(18, 26), "#14281e", { trunk: "#1a1410" });
  for (let x = -10; x < BG_WIDTH + 10; x += p.int(30, 45)) p.pine(x, 62, p.int(30, 38), "#0b1812", { trunk: "#120d09" });
  p.ground("#3d6b3a", ["#2f4a2a", "#263d22", "#1d2f1a"], ["#4f7d44", "#1a2a16", "#3d6b3a"]);
  // Grasbüschel, Pilze, Glühwürmchen
  for (let i = 0; i < 24; i++) {
    const x = p.int(0, BG_WIDTH);
    p.px(x, BG_GROUND - 1, "#4f7d44");
    p.px(x + 1, BG_GROUND - 2, "#5f9150");
  }
  for (const x of [20, 98, 163]) {
    p.rect(x, BG_GROUND - 2, 1, 2, "#e8dcc0");
    p.rect(x - 1, BG_GROUND - 3, 3, 1, "#c0503a");
    p.px(x, BG_GROUND - 3, "#f5f2ea");
  }
  p.scatter(14, [0, 20, BG_WIDTH, BG_GROUND - 4], ["#f4e27a", "#c9e870"]);
};

const mistmarsh: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#1c2624", "#26302e", "#34413b", "#4a5a50"]);
  p.circle(40, 14, 5, "#8fa395");
  p.ridge(40, 3, "#2e3b36", { freq: 0.7 });
  for (let x = 6; x < BG_WIDTH; x += p.int(14, 24)) p.deadTree(x, 46, p.int(16, 24), "#222c29");
  p.haze(28, 14, "#56675d", 7);
  p.ridge(50, 2, "#27322d", { freq: 1.4 });
  for (const x of [22, 64, 128, 170]) {
    p.deadTree(x, 59, p.int(30, 40), "#141b19");
    p.deadTree(x + 1, 59, p.int(26, 34), "#141b19");
  }
  p.haze(46, 10, "#6b7d71", 5);
  p.ground("#4b5e3a", ["#3b4a32", "#2f3c29", "#232e20"], ["#56693f", "#1d261a"]);
  // Tümpel mit Spiegelung und Seerosen
  for (const [x, w] of [
    [8, 26],
    [76, 22],
    [140, 30],
  ]) {
    p.rect(x, BG_GROUND + 6, w, 4, "#22322f");
    p.rect(x + 2, BG_GROUND + 7, w - 6, 1, "#3e5a52");
    p.rect(x + w / 2, BG_GROUND + 8, 3, 1, "#4f7d44");
  }
  // Schilf
  for (let i = 0; i < 30; i++) {
    const x = p.int(0, BG_WIDTH);
    const h = p.int(3, 7);
    p.rect(x, BG_GROUND - h, 1, h, i % 3 ? "#56693f" : "#6b7d4a");
    if (i % 4 === 0) p.rect(x, BG_GROUND - h - 2, 1, 2, "#6b4a2b");
  }
};

const crystalCaves: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#0d0c1c", "#15142b", "#1d1b3a", "#24224a"]);
  // Höhlenwand mit Struktur
  p.scatter(90, [0, 10, BG_WIDTH, BG_GROUND], ["#26244d", "#100f22", "#2c2a58"]);
  // Leuchtende Kristalle an der Rückwand
  const shard = (x: number, base: number, h: number, light: string, mid: string) => {
    for (let r = 0; r < h; r++) {
      const half = r < 2 ? 0 : 1;
      p.rect(x - half, base - h + r, half * 2 + 1, 1, mid);
      p.px(x - half, base - h + r, light);
    }
  };
  /** Gruppe aus drei Kristallen mit dezentem Lichthof. */
  const crystal = (x: number, base: number, h: number, light: string, mid: string) => {
    p.glow(x, base - h / 2, Math.round(h * 0.9), mid === "#3fc8d8" ? "#1d4a66" : "#3a2a6a");
    shard(x - 3, base, Math.round(h * 0.6), light, mid);
    shard(x + 3, base, Math.round(h * 0.7), light, mid);
    shard(x, base, h, light, mid);
  };
  for (let x = 12; x < BG_WIDTH; x += p.int(24, 36)) {
    const cyan = p.rnd() < 0.5;
    crystal(x, p.int(40, 54), p.int(8, 13), cyan ? "#b8fbff" : "#e6d0ff", cyan ? "#3fc8d8" : "#9a6ae0");
  }
  // Tropfsteine von der Decke
  for (let x = 0; x < BG_WIDTH; x++) {
    const h = Math.max(0, Math.round(5 + Math.sin(x / 4) * 3 + (p.rnd() < 0.15 ? p.int(4, 14) : 0)));
    p.rect(x, 0, 1, h, "#0a0916");
    if (h > 8) p.px(x, h, "#3fc8d8");
  }
  p.ground("#4a4680", ["#34305a", "#2a2648", "#1e1b36"], ["#5a56a0", "#16142a"]);
  // Kristalle am Boden vorne
  for (const [x, cyan] of [
    [14, true],
    [62, false],
    [118, true],
    [170, false],
  ] as const)
    crystal(x, BG_GROUND + 2, 9, cyan ? "#b8fbff" : "#e6d0ff", cyan ? "#3fc8d8" : "#9a6ae0");
};

const frostPeaks: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#141d33", "#1f2d4a", "#2e4466", "#4a6488"]);
  p.scatter(30, [0, 0, BG_WIDTH, 22], ["#ffffff", "#b8d4ff", "#8fb0e0"]);
  // Ferne Berge mit Schneekappen und Schattenseite
  const peaks = p.ridge(30, 14, "#5a7298", { peaky: true, freq: 0.9 });
  peaks.forEach((h, x) => {
    for (let y = h; y < h + 5 && y < 34; y++) p.px(x, y, (x + y) % 3 ? "#eef4ff" : "#c8d6e5");
    if ((peaks[x + 1] ?? h) < h) p.rect(x, h + 5, 1, 3, "#4a6086");
  });
  p.ridge(46, 6, "#3e5576", { peaky: true, freq: 1.6 });
  for (let x = 0; x < BG_WIDTH; x += p.int(9, 15)) p.pine(x, 56, p.int(10, 16), "#1f3448", { snow: "#e6eef8" });
  p.ground("#ffffff", ["#e6eef8", "#c8d6e5", "#a9bcd2"], ["#ffffff", "#9fb4cc", "#b8cce0"]);
  // Eisflächen und Schneefall
  for (const x of [30, 110]) {
    p.rect(x, BG_GROUND + 9, 18, 2, "#9ad9f0");
    p.rect(x + 3, BG_GROUND + 9, 6, 1, "#e8fbff");
  }
  p.scatter(60, [0, 0, BG_WIDTH, BG_GROUND], ["#ffffff", "#dde8f5"]);
};

const shadowRuins: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#0d0814", "#170f24", "#24183a", "#33244a"]);
  p.glow(36, 18, 16, "#3a2a56");
  p.circle(36, 18, 9, "#e6dcf5");
  p.circle(33, 16, 2, "#c9bde0");
  p.circle(39, 21, 1, "#c9bde0");
  p.scatter(20, [60, 0, BG_WIDTH, 26], ["#c9bde0", "#7a6a9a"]);
  p.ridge(48, 3, "#1c1328", { freq: 0.8 });
  // Zerfallene Säulen und ein Bogen
  const column = (x: number, h: number, broken: boolean) => {
    p.rect(x - 1, BG_GROUND - h, 5, h, "#2a2038");
    p.rect(x, BG_GROUND - h, 1, h, "#3a2d4a");
    p.rect(x - 2, BG_GROUND - 2, 7, 2, "#2a2038");
    if (broken) for (let i = 0; i < 4; i++) p.px(x - 1 + i, BG_GROUND - h - (i % 2), "#2a2038");
    else p.rect(x - 2, BG_GROUND - h - 2, 7, 2, "#2a2038");
  };
  column(70, 30, false);
  column(96, 30, false);
  for (let x = 70; x <= 99; x++) {
    const arc = Math.round(Math.sqrt(Math.max(0, 15 * 15 - (x - 84.5) ** 2)) / 2);
    p.rect(x, BG_GROUND - 32 - arc, 1, 3, "#2a2038");
  }
  column(14, 22, true);
  column(150, 17, true);
  column(168, 26, false);
  p.ground("#4a3a58", ["#3a2d40", "#2e2334", "#221a28"], ["#54446a", "#1a131f"]);
  // Steinplatten-Fugen und Grabsteine
  for (let x = 0; x < BG_WIDTH; x += 12) p.rect(x, BG_GROUND + 1, 1, BG_HEIGHT, "#2a2030");
  for (let y = BG_GROUND + 6; y < BG_HEIGHT; y += 6) p.rect(0, y, BG_WIDTH, 1, "#2a2030");
  for (const x of [32, 124, 140]) {
    p.rect(x, BG_GROUND - 6, 5, 6, "#3e3350");
    p.rect(x + 1, BG_GROUND - 7, 3, 1, "#3e3350");
    p.rect(x + 2, BG_GROUND - 5, 1, 3, "#251c30");
  }
};

const dragonHoard: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#160606", "#2d0f0f", "#45160f", "#5e2412"]);
  // Vulkanische Felswände mit Lavafällen
  p.ridge(18, 8, "#1e0909", { freq: 1.2, to: 0 }); // Höhlendecke
  for (const x of [26, 160]) {
    p.glow(x + 2, 34, 12, "#6a1e0c");
    for (let y = 10; y < 46; y++) {
      p.rect(x, y, 5, 1, "#e0612f");
      p.rect(x + 1 + (y % 3 === 0 ? 1 : 0), y, 2, 1, (y + x) % 6 < 2 ? "#fff1a8" : "#f08a2c");
    }
    p.glow(x + 2, 46, 7, "#f08a2c");
    p.rect(x - 4, 45, 13, 2, "#f08a2c");
    p.rect(x - 2, 45, 9, 1, "#ffd27a");
  }
  p.ridge(40, 6, "#2a0d0a", { freq: 1.1 });
  // Goldhaufen mit Glanz
  const hoard = (cx: number, w: number, h: number) => {
    for (let x = -w; x <= w; x++) {
      const top = Math.round(BG_GROUND - h * (1 - (x / w) ** 2));
      p.rect(cx + x, top, 1, BG_GROUND - top, x < 0 ? "#f4c95d" : "#c9962e");
      if (p.rnd() < 0.25) p.px(cx + x, top + p.int(0, 2), "#fff1a8");
    }
  };
  hoard(84, 18, 9);
  hoard(160, 14, 7);
  hoard(8, 10, 5);
  p.ground("#7a2f16", ["#5a2416", "#431a10", "#2e110a"], ["#3a150c", "#6e2a14"]);
  // Glühende Risse und aufsteigende Glut
  for (const x of [20, 70, 120, 150]) {
    for (let k = 0; k < 10; k++) p.px(x + k + (k % 3 === 0 ? 1 : 0), BG_GROUND + 4 + Math.floor(k / 3), k % 2 ? "#f08a2c" : "#ffd27a");
  }
  p.scatter(40, [0, 10, BG_WIDTH, BG_GROUND], ["#ff8c3a", "#ffd27a", "#c23a3a"]);
};

/* ───────────── Dungeons ───────────── */

const abandonedMine: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#0c0a08", "#15110d", "#1f1913", "#2a2219"]);
  p.scatter(120, [0, 0, BG_WIDTH, BG_GROUND], ["#2e251b", "#0a0806", "#3a2e22"]);
  // Erzadern
  for (let i = 0; i < 9; i++) {
    const x = p.int(0, BG_WIDTH);
    const y = p.int(8, 48);
    const color = i % 3 === 0 ? "#6fb0d8" : "#c0602f";
    for (let k = 0; k < 4; k++) p.px(x + k, y + (k % 2), color);
  }
  // Stützbalken mit Laternen
  for (const x of [18, 78, 138]) {
    p.rect(x, 6, 3, BG_GROUND - 6, "#5c3a1c");
    p.rect(x + 1, 6, 1, BG_GROUND - 6, "#7a4f2a");
    p.rect(x + 28, 6, 3, BG_GROUND - 6, "#5c3a1c");
    p.rect(x + 29, 6, 1, BG_GROUND - 6, "#7a4f2a");
    p.rect(x - 2, 4, 35, 3, "#4a2e18");
    p.rect(x - 2, 4, 35, 1, "#7a4f2a");
    p.glow(x + 15, 12, 9, "#5a3a14");
    p.rect(x + 15, 7, 1, 2, "#2a2219");
    p.rect(x + 14, 9, 3, 4, "#f4c95d");
    p.px(x + 15, 10, "#fff1a8");
  }
  p.ground("#4a3a2a", ["#3a2e22", "#2e2419", "#221a12"], ["#4f3f2c", "#18120c"]);
  // Schienen
  p.rect(0, BG_GROUND + 9, BG_WIDTH, 1, "#8a909a");
  p.rect(0, BG_GROUND + 14, BG_WIDTH, 1, "#8a909a");
  for (let x = 2; x < BG_WIDTH; x += 6) p.rect(x, BG_GROUND + 8, 2, 8, "#4a2e18");
  p.rect(0, BG_GROUND + 9, BG_WIDTH, 1, "#a8aeb8");
};

const sunkenTemple: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#3a1e2a", "#7a3a2a", "#c0703a", "#e8a85a"]);
  p.glow(140, 34, 18, "#f0b860");
  p.circle(140, 34, 9, "#ffe2a0");
  p.ridge(46, 5, "#b07a42", { freq: 0.6 });
  // Tempel mit Säulen und Giebel
  const tx = 58;
  p.rect(tx, 26, 52, 2, "#8a5a2e");
  for (let i = 0; i < 20; i++) p.rect(tx + 6 + i, 26 - Math.floor(i / 2), 40 - i * 2, 1, i % 4 ? "#9c6a38" : "#7a4a24");
  for (let c = 0; c < 6; c++) {
    p.rect(tx + 3 + c * 9, 28, 4, 22, "#a8763e");
    p.rect(tx + 4 + c * 9, 28, 1, 22, "#c99a5a");
  }
  p.rect(tx - 2, 50, 56, 3, "#8a5a2e");
  p.rect(tx + 23, 36, 6, 14, "#3a2416"); // Eingang
  p.ridge(54, 3, "#c99a5a", { freq: 1.1 });
  p.ground("#e8c07a", ["#d4a860", "#b8894a", "#9a6e38"], ["#f0d090", "#a07440"]);
  // Sandwellen
  for (let y = BG_GROUND + 4; y < BG_HEIGHT; y += 5)
    for (let x = 0; x < BG_WIDTH; x++) if ((x + y * 3) % 14 < 6) p.px(x, y + Math.round(Math.sin(x / 6)), "#e8c07a");
};

const stormTower: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#080c18", "#101a30", "#1a2842", "#24344f"]);
  // Wolkenmeer unterhalb des Turms
  for (let layer = 0; layer < 3; layer++) {
    const y = 32 + layer * 7;
    const color = ["#2e3c58", "#3a4a68", "#4a5a7a"][layer];
    for (let x = 0; x < BG_WIDTH; x += p.int(6, 10)) p.circle(x, y + p.int(0, 2), p.int(4, 7), color);
  }
  // Blitze
  const bolt = (x: number, y: number, len: number) => {
    let cx = x;
    for (let k = 0; k < len; k++) {
      p.px(cx, y + k, "#fff6c2");
      p.px(cx + 1, y + k, "#8ab8ff");
      if (k % 3 === 2) cx += p.rnd() < 0.5 ? -1 : 1;
    }
  };
  p.glow(42, 16, 12, "#2a3e66");
  bolt(42, 4, 24);
  bolt(150, 2, 18);
  // Regen
  for (let i = 0; i < 70; i++) {
    const x = p.int(0, BG_WIDTH);
    const y = p.int(0, BG_GROUND);
    p.px(x, y, "#5a6a8a");
    p.px(x - 1, y + 1, "#4a5a7a");
  }
  // Zinnen der Turmspitze
  p.rect(0, BG_GROUND - 6, BG_WIDTH, 6, "#2a3044");
  for (let x = 0; x < BG_WIDTH; x += 12) {
    p.rect(x, BG_GROUND - 10, 7, 4, "#2a3044");
    p.rect(x, BG_GROUND - 10, 7, 1, "#4a526a");
  }
  p.rect(0, BG_GROUND - 6, BG_WIDTH, 1, "#4a526a");
  p.ground("#5a627a", ["#3a4258", "#2e3548", "#222838"], ["#4a526a", "#1a1f2c"]);
  for (let x = 0; x < BG_WIDTH; x += 10) p.rect(x, BG_GROUND + 1, 1, BG_HEIGHT, "#2a3044");
  for (let y = BG_GROUND + 5; y < BG_HEIGHT; y += 5) p.rect(0, y, BG_WIDTH, 1, "#2a3044");
};

const voidAbyss: Painter = (p) => {
  p.gradient(0, BG_GROUND, ["#05030a", "#0e0816", "#160c24", "#1e1030"]);
  // Nebelwolken in Leerenfarben
  for (const [x, y, r, c] of [
    [40, 20, 16, "#2a1450"],
    [120, 14, 20, "#1a2a50"],
    [160, 36, 12, "#3a1a5a"],
  ] as const)
    p.glow(x, y, r, c);
  p.scatter(70, [0, 0, BG_WIDTH, BG_GROUND], ["#ffffff", "#b07cff", "#4af0ff", "#8a6bff"]);
  // Schwebende Felsen mit leuchtenden Kanten
  const rock = (cx: number, cy: number, w: number) => {
    for (let x = -w; x <= w; x++) {
      const depth = Math.round((w - Math.abs(x)) * 0.8) + 1;
      p.rect(cx + x, cy, 1, depth, "#2a1a40");
      p.px(cx + x, cy, "#5a3a8a");
    }
    p.px(cx, cy + Math.round(w * 0.8) + 1, "#4af0ff");
  };
  rock(30, 30, 11);
  rock(96, 16, 7);
  rock(150, 42, 13);
  rock(70, 47, 6);
  p.ground("#5a3a8a", ["#2a1a40", "#1e1230", "#140c22"], ["#3a2458", "#0e0818"]);
  // Risse mit Leerenlicht
  for (const x of [24, 100, 156]) {
    for (let k = 0; k < 12; k++) p.px(x + k, BG_GROUND + 3 + Math.round(Math.sin(k) * 1.5) + Math.floor(k / 4), k % 2 ? "#4af0ff" : "#b07cff");
  }
};

/* ───────────── Endlos-Turm ───────────── */

/**
 * Halle im Endlos-Turm: Quadermauern, hohe Bogenfenster mit Sternenhimmel
 * (oben liegt nur noch der Himmel), Säulen mit Kohlebecken und ein
 * glimmender Runenkreis auf dem Steinboden.
 */
const endlessTower: Painter = (p) => {
  // Mauerwerk: versetzte Quader mit dunklen Fugen und hellen Kanten
  p.gradient(0, BG_GROUND, ["#191326", "#201831", "#28203d", "#2f2647"]);
  for (let row = 0; row * 6 < BG_GROUND; row++) {
    const y = row * 6;
    p.rect(0, y, BG_WIDTH, 1, "#120d1d");
    for (let x = row % 2 ? -6 : 0; x < BG_WIDTH; x += 12) {
      p.rect(x, y, 1, 6, "#120d1d");
      if (p.rnd() < 0.35) p.rect(x + 2, y + 1, p.int(3, 7), 1, "#3b3057");
    }
  }
  // Bogenfenster: Rahmen, Nachthimmel, Sterne – im mittleren der Mond
  for (const cx of [32, 90, 148]) {
    p.rect(cx - 9, 13, 19, 30, "#4a3d6a");
    p.circle(cx, 13, 9, "#4a3d6a");
    p.rect(cx - 7, 13, 15, 29, "#0a0918");
    p.circle(cx, 13, 7, "#0a0918");
    p.scatter(9, [cx - 6, 7, cx + 6, 38], ["#e8e4ff", "#9fb4ff", "#c9a8ff"]);
    p.rect(cx - 9, 42, 19, 2, "#5a4c80"); // Sims
    p.rect(cx, 6, 1, 36, "#4a3d6a"); // Fensterkreuz
    p.rect(cx - 7, 24, 15, 1, "#4a3d6a");
  }
  p.circle(90, 18, 3, "#f1ecd2");
  p.px(91, 17, "#ffffff");
  // Säulen mit Kapitell und Kohlebecken
  for (const x of [58, 116]) {
    p.rect(x, 4, 8, BG_GROUND - 4, "#3a2f55");
    p.rect(x + 1, 4, 1, BG_GROUND - 4, "#4d4170");
    p.rect(x + 6, 4, 1, BG_GROUND - 4, "#2a2140");
    p.rect(x - 1, 2, 10, 3, "#4d4170");
    p.rect(x - 1, BG_GROUND - 3, 10, 3, "#4d4170");
    p.glow(x + 4, 30, 9, "#f08a2c");
    p.rect(x, 31, 8, 3, "#5a4030");
    p.rect(x + 1, 28, 6, 3, "#f08a2c");
    p.rect(x + 2, 26, 4, 2, "#ffd27a");
    p.px(x + 4, 25, "#fff1c4");
  }
  // Wimpel mit Turm-Zeichen zwischen den Fenstern
  for (const x of [10, 170]) {
    p.rect(x - 3, 6, 7, 20, "#5a2a6e");
    p.rect(x - 3, 6, 7, 1, "#d6b45a");
    p.px(x - 3, 26, "#5a2a6e");
    p.px(x + 3, 26, "#5a2a6e");
    p.px(x, 27, "#5a2a6e");
    // Kleiner Turm mit Zinnen als Zeichen
    p.rect(x - 1, 12, 3, 9, "#d6b45a");
    p.px(x - 2, 11, "#d6b45a");
    p.px(x, 11, "#d6b45a");
    p.px(x + 2, 11, "#d6b45a");
    p.rect(x - 2, 12, 5, 1, "#d6b45a");
    p.px(x, 19, "#5a2a6e");
    p.px(x, 15, "#5a2a6e");
  }
  // Glimmende Runen im Mauerwerk
  p.scatter(16, [0, 4, BG_WIDTH, BG_GROUND - 6], ["#5ad8e6", "#3a8fb0"]);
  // Steinboden mit Plattenfugen und Runenkreis in der Mitte
  p.ground("#5a4c80", ["#2e2645", "#241d38", "#1a1429"], ["#3e3460", "#140f20"], 50);
  for (let x = 4; x < BG_WIDTH; x += 16) p.rect(x, BG_GROUND + 1, 1, BG_HEIGHT - BG_GROUND, "#1a1429");
  p.rect(0, BG_GROUND + 9, BG_WIDTH, 1, "#1a1429");
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    p.px(90 + Math.cos(t) * 34, BG_GROUND + 9 + Math.sin(t) * 5, a % 3 ? "#5ad8e6" : "#a8f0ff");
  }
  p.glow(90, BG_GROUND + 9, 8, "#3a8fb0");
};

const PAINTERS: Record<string, Painter> = {
  "endless-tower": endlessTower,
  darkwood,
  mistmarsh,
  "crystal-caves": crystalCaves,
  "frost-peaks": frostPeaks,
  "shadow-ruins": shadowRuins,
  "dragon-hoard": dragonHoard,
  "abandoned-mine": abandonedMine,
  "sunken-temple": sunkenTemple,
  "storm-tower": stormTower,
  "void-abyss": voidAbyss,
};

/* ───────────── Dorf ───────────── */

/** Häuser der Dorfbewohner auf dem Hügel – mit jedem zweiten Ausbau kommt eines dazu. */
const HILL_HOUSES = [150, 92, 210, 40, 256, 128, 14, 180, 64, 284];
/** Lücken zwischen den Gebäuden (VILLAGE_SLOTS): dort stehen Laternen und Fahnen. */
const VILLAGE_GAPS = [45, 87, 129, 171, 213, 255];

/**
 * Hintergrund des Dorfs (VILLAGE_WIDTH × BG_HEIGHT). `progress` = Summe aller
 * Gebäudestufen (0–21): Je weiter das Dorf ausgebaut ist, desto mehr Häuser stehen
 * auf dem Hügel, desto besser sind Weg und Zaun, und es kommen Blumen, Laternen
 * und Wimpel dazu.
 * Jede Schicht hat ihren eigenen Zufall, damit sich das Bild beim Ausbau nur
 * dort ändert, wo etwas dazukommt.
 */
export function paintVillage(ctx: CanvasRenderingContext2D, progress: number): void {
  const layer = (name: string) => new Canvas(ctx, `village-${name}`, VILLAGE_WIDTH);

  const sky = layer("sky");
  sky.gradient(0, BG_GROUND, ["#232a4a", "#3a4470", "#655f8a", "#8f7590"]);
  sky.scatter(16, [0, 0, VILLAGE_WIDTH, 20], ["#cfd6ff", "#8f98c9"]);
  sky.circle(250, 11, 5, "#f4e6b0");
  sky.ridge(40, 6, "#3e4a66", { freq: 0.6 });
  const hill = sky.ridge(50, 3, "#2d4636", { freq: 1.1 });

  // Häuser auf dem Hügel, mit erleuchtetem Fenster
  for (const x of HILL_HOUSES.slice(0, Math.floor(progress / 2))) {
    const y = hill[x] + 1;
    sky.rect(x - 2, y - 4, 5, 4, "#1d2c26");
    sky.rect(x - 3, y - 5, 7, 1, "#5a2a26");
    sky.rect(x - 2, y - 6, 5, 1, "#5a2a26");
    sky.px(x, y - 7, "#5a2a26");
    sky.px(x, y - 3, "#f4d27a");
  }

  const trees = layer("trees");
  for (let x = 2; x < VILLAGE_WIDTH; x += trees.int(14, 22)) trees.pine(x, BG_GROUND, trees.int(10, 15), "#1d3529", { trunk: "#1a1410" });

  const ground = layer("ground");
  ground.ground("#5d8a4a", ["#4a6e3a", "#3e5c31", "#334d29"], ["#6f9c58", "#2c4424", "#57804a"]);

  paintVillageFence(layer("fence"), progress);
  paintVillagePath(layer("path"), progress);

  if (progress >= 3) {
    const flowers = layer("flowers");
    const colors = ["#e86a8a", "#f4d27a", "#b48ae0", "#f5f2ea"];
    for (let i = 0; i < 10 + progress * 2; i++) {
      const x = flowers.int(0, VILLAGE_WIDTH);
      const y = flowers.int(76, BG_HEIGHT - 1);
      flowers.px(x, y + 1, "#3d6b3a");
      flowers.px(x, y, colors[i % colors.length]);
    }
  }

  if (progress >= 9) {
    const lamps = layer("lamps");
    for (const x of VILLAGE_GAPS) {
      lamps.glow(x, 60, 5, "#f4d27a");
      lamps.rect(x, 61, 1, 9, "#2b2230");
      lamps.rect(x - 1, 59, 3, 2, "#2b2230");
      lamps.px(x, 60, "#fff1b0");
    }
  }

  if (progress >= 18) {
    // Wimpel an Fahnenstangen und eine Wimpelkette quer über den Platz
    const flags = layer("flags");
    const colors = ["#c0503a", "#e6b84a", "#56698a", "#6fa35a"];
    for (const [i, x] of VILLAGE_GAPS.entries()) {
      flags.rect(x + 2, 40, 1, 30, "#4a2e19");
      flags.rect(x + 3, 40, 4, 3, colors[i % colors.length]);
      flags.rect(x + 3, 43, 2, 1, colors[i % colors.length]);
    }
    for (let x = 0; x < VILLAGE_WIDTH; x++) {
      const y = 22 + Math.round(Math.abs(Math.sin((x / VILLAGE_WIDTH) * Math.PI * 3)) * -4 + 4);
      flags.px(x, y, "#2b2230");
      if (x % 6 === 2) {
        const c = colors[(x / 6) % colors.length | 0];
        flags.rect(x - 1, y + 1, 3, 1, c);
        flags.px(x, y + 2, c);
      }
    }
  }
}

/** Zaun hinter den Gebäuden: ein paar Pflöcke → Holzzaun → Palisade → Steinmauer. */
function paintVillageFence(p: Canvas, progress: number) {
  const base = BG_GROUND + 2;
  if (progress < 5) {
    for (let x = 4; x < VILLAGE_WIDTH; x += p.int(18, 30)) p.rect(x, base - 4, 1, 4, "#6b4423");
  } else if (progress < 12) {
    for (let x = 1; x < VILLAGE_WIDTH; x += 6) p.rect(x, base - 6, 1, 6, "#6b4423");
    p.rect(0, base - 5, VILLAGE_WIDTH, 1, "#8a6038");
    p.rect(0, base - 2, VILLAGE_WIDTH, 1, "#8a6038");
  } else if (progress < 19) {
    for (let x = 0; x < VILLAGE_WIDTH; x += 2) {
      const h = 8 + (x % 4 === 0 ? 1 : 0);
      p.rect(x, base - h, 2, h, x % 4 === 0 ? "#7a5030" : "#6b4423");
      p.px(x, base - h - 1, "#4a2e19");
    }
    p.rect(0, base - 6, VILLAGE_WIDTH, 1, "#4a2e19");
  } else {
    p.rect(0, base - 9, VILLAGE_WIDTH, 9, "#8d877c");
    for (let y = base - 9; y < base; y += 3)
      for (let x = (y % 2) * 3; x < VILLAGE_WIDTH; x += 6) p.rect(x, y, 1, 3, "#6a655d");
    for (let y = base - 6; y < base; y += 3) p.rect(0, y, VILLAGE_WIDTH, 1, "#6a655d");
    for (let x = 0; x < VILLAGE_WIDTH; x += 6) p.rect(x, base - 11, 3, 2, "#8d877c");
  }
}

/** Weg vor den Gebäuden: Erde → Kies → Pflaster. */
function paintVillagePath(p: Canvas, progress: number) {
  const top = 70;
  const bottom = 75;
  if (progress < 7) {
    p.rect(0, top, VILLAGE_WIDTH, bottom - top, "#7a5a3a");
    p.rect(0, top + 1, VILLAGE_WIDTH, 1, "#6a4c30");
    p.rect(0, bottom - 2, VILLAGE_WIDTH, 1, "#6a4c30");
    p.scatter(20, [0, top, VILLAGE_WIDTH, bottom - 1], ["#8c6a46"]);
  } else if (progress < 14) {
    p.rect(0, top, VILLAGE_WIDTH, bottom - top, "#8c8478");
    p.scatter(120, [0, top, VILLAGE_WIDTH, bottom - 1], ["#a59d90", "#6f685e", "#9a9286"]);
  } else {
    p.rect(0, top, VILLAGE_WIDTH, bottom - top, "#5e5850");
    for (let y = top; y < bottom; y += 2)
      for (let x = (y / 2) % 2 === 0 ? 0 : 2; x < VILLAGE_WIDTH; x += 4) {
        p.rect(x, y, 3, 1, p.rnd() < 0.5 ? "#a39b8d" : "#958d80");
      }
  }
  p.rect(0, top - 1, VILLAGE_WIDTH, 1, "#4a6e3a");
}

/** Gibt es für dieses Gebiet einen gemalten Hintergrund? */
export function hasBackground(areaId: string): boolean {
  return areaId in PAINTERS;
}

/** Malt den Hintergrund eines Gebiets in einen Kontext der Grösse BG_WIDTH × BG_HEIGHT. */
export function paintBackground(ctx: CanvasRenderingContext2D, areaId: string): void {
  const painter = PAINTERS[areaId];
  if (!painter) throw new Error(`Kein Hintergrund für ${areaId}`);
  painter(new Canvas(ctx, areaId));
}
