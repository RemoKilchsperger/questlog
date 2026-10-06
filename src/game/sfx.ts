// Kampfgeräusche im Retro-Stil, direkt mit der Web Audio API erzeugt –
// wie die Pixel-Sprites ganz ohne Dateien. Jeder Klang besteht aus wenigen
// Bausteinen (Ton mit Tonhöhenverlauf, gefiltertes Rauschen) und schwankt
// leicht in der Tonhöhe, damit Wiederholungen nicht eintönig klingen.

import { useSoundStore } from "../store/soundStore";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function masterGain(): number {
  const { muted, volume } = useSoundStore.getState();
  // Quadratisch, damit der Regler sich gleichmässiger anfühlt.
  return muted ? 0 : volume * volume * 0.8;
}

/**
 * Audio-Kontext bei Bedarf anlegen – auch wenn stumm geschaltet ist, damit
 * die Musik weiterläuft und beim Einschalten sofort wieder zu hören ist.
 */
export function audioContext(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = masterGain();
    master.connect(ctx.destination);
    useSoundStore.subscribe(() => master!.gain.setTargetAtTime(masterGain(), ctx!.currentTime, 0.05));
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

/** Wie audioContext, aber null, wenn stumm – einzelne Effekte sparen wir uns dann. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  return masterGain() > 0 ? audioContext() : null;
}

/**
 * Bei einem Klick aufrufen: Browser erlauben Ton erst nach einer
 * Nutzeraktion, danach dürfen auch verzögerte Klänge spielen.
 */
export function unlockAudio() {
  audio();
}

export function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Zufällige Tonhöhen-Schwankung, z. B. 0.94 … 1.06 */
const vary = (amount = 0.06) => 1 + (Math.random() * 2 - 1) * amount;

interface ToneOptions {
  wave?: OscillatorType;
  from: number;
  to?: number;
  /** Sekunden */
  duration: number;
  volume?: number;
  /** Verzögerung in Sekunden */
  delay?: number;
  attack?: number;
}

function tone({ wave = "square", from, to = from, duration, volume = 0.3, delay = 0, attack = 0.005 }: ToneOptions) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(a.out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

interface NoiseOptions {
  filter?: BiquadFilterType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
  q?: number;
  attack?: number;
}

function hiss({ filter = "lowpass", from, to = from, duration, volume = 0.3, delay = 0, q = 1, attack = 0.005 }: NoiseOptions) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const src = a.ctx.createBufferSource();
  src.buffer = noise(a.ctx);
  src.loop = true;
  const biquad = a.ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, t);
  biquad.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(biquad).connect(gain).connect(a.out);
  // Zufälliger Startpunkt im Rauschen, damit es nicht jedes Mal gleich klingt.
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
}

/** Kleine Melodie: Frequenzen nacheinander im Abstand `step`. */
function arpeggio(notes: number[], step: number, wave: OscillatorType = "square", volume = 0.18, length = step * 1.6) {
  notes.forEach((f, i) => tone({ wave, from: f, duration: length, volume, delay: i * step }));
}

/* ───────────── Klänge ───────────── */

export const sfx = {
  /** Luftzug einer Waffe oder eines Ausfallschritts */
  swing() {
    const v = vary(0.15);
    hiss({ filter: "bandpass", from: 500 * v, to: 2600 * v, duration: 0.14, volume: 0.22, q: 2, attack: 0.04 });
  },

  /** Längeres Rauschen – Teleport, Wurf, Sprung */
  whoosh(duration = 0.3) {
    const v = vary(0.1);
    hiss({ filter: "bandpass", from: 300 * v, to: 1800 * v, duration, volume: 0.2, q: 1.5, attack: duration * 0.5 });
  },

  /** Treffer – `heavy` für Hiebe mit Bildschirmwackeln */
  hit(crit = false, heavy = false) {
    const v = vary();
    hiss({ filter: "lowpass", from: 2400 * v, to: 200, duration: 0.14, volume: 0.45 });
    tone({ wave: "square", from: 190 * v, to: 55, duration: 0.12, volume: 0.22 });
    if (heavy) {
      tone({ wave: "sine", from: 110 * v, to: 32, duration: 0.4, volume: 0.55 });
      hiss({ filter: "lowpass", from: 500, to: 80, duration: 0.35, volume: 0.35 });
    }
    if (crit) {
      tone({ wave: "square", from: 1046 * v, to: 1568 * v, duration: 0.09, volume: 0.13, delay: 0.03 });
      tone({ wave: "triangle", from: 2093 * v, duration: 0.22, volume: 0.15, delay: 0.08 });
    }
  },

  /** Klingenschnitt */
  slash() {
    const v = vary(0.12);
    hiss({ filter: "highpass", from: 2500 * v, to: 6000 * v, duration: 0.09, volume: 0.18, attack: 0.02 });
  },

  /** Held kündigt eine Fähigkeit an */
  ability() {
    const v = vary(0.03);
    tone({ wave: "triangle", from: 330 * v, to: 990 * v, duration: 0.22, volume: 0.22 });
    tone({ wave: "square", from: 1320 * v, duration: 0.15, volume: 0.08, delay: 0.16 });
  },

  /** Licht, Zauber, Kuppel – heller Schimmer */
  magic() {
    const v = vary(0.04);
    arpeggio([784 * v, 988 * v, 1175 * v, 1568 * v], 0.05, "triangle", 0.12, 0.18);
  },

  /** Strahl (Zepter, Auge, Lich) */
  beam(low = false) {
    const v = vary(0.05) * (low ? 0.5 : 1);
    tone({ wave: "sawtooth", from: 260 * v, to: 720 * v, duration: 0.38, volume: 0.1, attack: 0.03 });
    tone({ wave: "square", from: 270 * v, to: 740 * v, duration: 0.38, volume: 0.06, attack: 0.03 });
  },

  /** Feuer: Fauchen und Prasseln */
  fire(duration = 0.45) {
    hiss({ filter: "bandpass", from: 400, to: 1400, duration, volume: 0.35, q: 0.8, attack: 0.05 });
    hiss({ filter: "lowpass", from: 300, to: 120, duration: duration + 0.1, volume: 0.25 });
  },

  /** Explosion beim Aufprall (Feuerball) */
  explosion() {
    hiss({ filter: "lowpass", from: 1800, to: 60, duration: 0.5, volume: 0.55 });
    tone({ wave: "sine", from: 90, to: 30, duration: 0.45, volume: 0.45 });
  },

  /** Boden bebt (Stampfer, Hammer, Steinschlag) */
  quake(duration = 0.55) {
    tone({ wave: "sine", from: 70, to: 28, duration, volume: 0.55 });
    hiss({ filter: "lowpass", from: 350, to: 60, duration, volume: 0.4, attack: 0.03 });
  },

  /** Blitz: Knall und Donnergrollen */
  thunder() {
    hiss({ filter: "highpass", from: 3000, to: 800, duration: 0.12, volume: 0.45 });
    tone({ wave: "sawtooth", from: 1600, to: 200, duration: 0.12, volume: 0.15 });
    hiss({ filter: "lowpass", from: 400, to: 60, duration: 0.9, volume: 0.4, delay: 0.08, attack: 0.08 });
  },

  /** Gift: blubbernde Blasen */
  poison() {
    for (let i = 0; i < 4; i++) {
      const f = 250 + Math.random() * 300;
      tone({ wave: "sine", from: f, to: f * 1.8, duration: 0.07, volume: 0.18, delay: i * 0.07 + Math.random() * 0.03 });
    }
  },

  /** Brennen: kurzes Fauchen mit knisternden Funken */
  burn() {
    hiss({ filter: "bandpass", from: 700, to: 1600, duration: 0.3, volume: 0.25, q: 0.8, attack: 0.04 });
    for (let i = 0; i < 5; i++) {
      hiss({ filter: "highpass", from: 3000 + Math.random() * 3000, duration: 0.025, volume: 0.2, delay: 0.03 + Math.random() * 0.3 });
    }
  },

  /** Bluten: dumpfer Schnitt, dann fallende Tropfen */
  bleed() {
    hiss({ filter: "lowpass", from: 1200, to: 300, duration: 0.1, volume: 0.25 });
    for (let i = 0; i < 3; i++) {
      const f = 900 - i * 120 + Math.random() * 80;
      tone({ wave: "sine", from: f, to: f * 0.45, duration: 0.08, volume: 0.2, delay: 0.12 + i * 0.13 });
    }
  },

  /** Fluch / Strudel – tiefes, sinkendes Wabern */
  curse() {
    const v = vary(0.05);
    tone({ wave: "triangle", from: 520 * v, to: 130 * v, duration: 0.6, volume: 0.22, attack: 0.05 });
    tone({ wave: "sine", from: 540 * v, to: 125 * v, duration: 0.6, volume: 0.18, attack: 0.05 });
  },

  /** Heiltrank: aufsteigende Dur-Tonfolge */
  heal() {
    arpeggio([523, 659, 784, 1046], 0.07, "triangle", 0.2, 0.16);
  },

  /** Verstärkungstrank */
  buff() {
    arpeggio([392, 523, 784], 0.06, "square", 0.12, 0.12);
    hiss({ filter: "highpass", from: 4000, duration: 0.25, volume: 0.06, delay: 0.1, attack: 0.05 });
  },

  /** Bollwerk blockt: metallisches Klirren */
  block() {
    const v = vary(0.04);
    tone({ wave: "triangle", from: 1250 * v, duration: 0.35, volume: 0.22 });
    tone({ wave: "triangle", from: 1870 * v, duration: 0.28, volume: 0.15 });
    hiss({ filter: "highpass", from: 3500, duration: 0.08, volume: 0.25 });
  },

  /** Lebensentzug */
  drain() {
    tone({ wave: "sine", from: 900, to: 180, duration: 0.45, volume: 0.22, attack: 0.04 });
    tone({ wave: "triangle", from: 450, to: 90, duration: 0.45, volume: 0.12, attack: 0.04 });
  },

  /** Manaraub */
  manaBurn() {
    tone({ wave: "sine", from: 1400, to: 400, duration: 0.35, volume: 0.18, attack: 0.03 });
    tone({ wave: "square", from: 700, to: 200, duration: 0.3, volume: 0.06, delay: 0.05 });
  },

  /** Betäubt: kreisende Sternchen */
  stun() {
    [880, 1175, 880, 1175, 880].forEach((f, i) => tone({ wave: "triangle", from: f, duration: 0.09, volume: 0.13, delay: i * 0.1 }));
  },

  /** Boss holt zu seiner Fähigkeit aus: Brüllen */
  roar() {
    const v = vary(0.08);
    tone({ wave: "sawtooth", from: 150 * v, to: 70 * v, duration: 0.65, volume: 0.22, attack: 0.06 });
    tone({ wave: "square", from: 155 * v, to: 68 * v, duration: 0.65, volume: 0.12, attack: 0.06 });
    hiss({ filter: "bandpass", from: 700, to: 250, duration: 0.6, volume: 0.25, q: 1.2, attack: 0.06 });
  },

  victory() {
    arpeggio([523, 659, 784], 0.11, "square", 0.16, 0.14);
    tone({ wave: "square", from: 1046, duration: 0.45, volume: 0.16, delay: 0.33 });
    tone({ wave: "triangle", from: 523, duration: 0.45, volume: 0.18, delay: 0.33 });
  },

  defeat() {
    arpeggio([392, 311, 262], 0.22, "triangle", 0.22, 0.3);
    tone({ wave: "triangle", from: 196, to: 160, duration: 0.7, volume: 0.22, delay: 0.66 });
  },

  /** Hastige Schritte davon */
  flee() {
    for (let i = 0; i < 5; i++) {
      hiss({ filter: "bandpass", from: 900 - i * 80, duration: 0.05, volume: 0.25 - i * 0.03, q: 3, delay: i * 0.11 });
    }
    tone({ wave: "square", from: 660, to: 330, duration: 0.25, volume: 0.08 });
  },
};
