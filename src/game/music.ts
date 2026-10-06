// Chiptune-Hintergrundmusik für den Kampf – wie die Effekte in sfx.ts direkt
// mit der Web Audio API erzeugt. Ein kleiner Sequenzer plant die Noten
// knapp im Voraus (Lookahead), damit der Takt auch bei Rucklern sauber bleibt.

import { useSoundStore } from "../store/soundStore";
import { audioContext, noise } from "./sfx";

/** Lautstärke der Musik im Verhältnis zu den Effekten */
const MUSIC_LEVEL = 0.45;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
/** Sechzehntel pro Takt */
const STEPS_PER_BAR = 16;

interface Song {
  bpm: number;
  /** Melodie in Achteln: Note ("A4", "C#5", "Bb4"), "." Pause, "-" halten */
  lead: string;
  /** Grundton je Takt (Bass) */
  roots: string[];
  /** Bassmuster in Achteln: Halbtöne über dem Grundton, null = Pause */
  bass: (number | null)[];
  /** Akkordtöne je Takt für das Arpeggio (Sechzehntel); leer = kein Arpeggio */
  arps: string[][];
  kick: number[];
  snare: number[];
  hat: number[];
}

/** Normaler Kampf: a-Moll, treibend, aber nicht hektisch. */
const BATTLE: Song = {
  bpm: 140,
  lead: [
    "A4 - C5 E5 A5 - G5 E5",
    "F5 - E5 C5 A4 - C5 -",
    "G4 - B4 D5 G5 - F5 D5",
    "E5 - - . G#4 - B4 -",
    "A5 - - G5 E5 - C5 E5",
    "F5 - - E5 C5 - A4 C5",
    "D5 - - C5 B4 - G4 B4",
    "E5 - - - G#4 - B4 -",
  ].join(" "),
  roots: ["A2", "F2", "G2", "E2", "A2", "F2", "G2", "E2"],
  bass: [0, null, 0, 12, 0, null, 7, 12],
  arps: [],
  kick: [0, 8, 10],
  snare: [4, 12],
  hat: [0, 2, 4, 6, 8, 10, 12, 14],
};

/** Bosskampf: d-Moll, schneller, mit Arpeggio und durchgehendem Bass. */
const BOSS: Song = {
  bpm: 165,
  lead: [
    "D5 - F5 - A5 G5 F5 E5",
    "F5 - D5 - Bb4 - D5 F5",
    "E5 - G5 - C6 Bb5 A5 G5",
    "A5 - - - C#5 - E5 -",
    "D6 - A5 F5 D5 - F5 A5",
    "Bb5 - F5 D5 Bb4 - D5 F5",
    "C6 - G5 E5 C5 - E5 G5",
    "A5 - C#6 - E6 - - -",
  ].join(" "),
  roots: ["D2", "Bb1", "C2", "A1", "D2", "Bb1", "C2", "A1"],
  bass: [0, 12, 0, 12, 0, 12, 7, 12],
  arps: [
    ["D4", "F4", "A4", "D5"],
    ["Bb3", "D4", "F4", "Bb4"],
    ["C4", "E4", "G4", "C5"],
    ["A3", "C#4", "E4", "A4"],
  ],
  kick: [0, 4, 8, 12, 14],
  snare: [4, 12],
  hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → Frequenz in Hz */
function freq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`Unbekannte Note: ${note}`);
  const semitone = NOTE_INDEX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

interface LeadNote {
  /** Start in Sechzehnteln */
  step: number;
  /** Länge in Sechzehnteln */
  length: number;
  freq: number;
}

/** Melodie-Text in Noten mit Start und Länge umwandeln. */
function parseLead(text: string): LeadNote[] {
  const notes: LeadNote[] = [];
  text.split(/\s+/).forEach((token, i) => {
    if (token === "-") {
      const last = notes[notes.length - 1];
      if (last && last.step + last.length === i * 2) last.length += 2;
    } else if (token !== ".") {
      notes.push({ step: i * 2, length: 2, freq: freq(token) });
    }
  });
  return notes;
}

interface Playing {
  song: Song;
  lead: Map<number, LeadNote>;
  totalSteps: number;
  step: number;
  nextTime: number;
  timer: number;
  bus: GainNode;
  /** Wer die Musik gestartet hat – nur dieser darf sie wieder stoppen. */
  owner: object;
}

let playing: Playing | null = null;
let current: Song | null = null;

function musicLevel(): number {
  return useSoundStore.getState().music ? MUSIC_LEVEL : 0;
}

useSoundStore.subscribe((s, prev) => {
  if (s.music !== prev.music && playing) {
    playing.bus.gain.setTargetAtTime(musicLevel(), playing.bus.context.currentTime, 0.1);
  }
});

function voice(
  c: AudioContext,
  out: AudioNode,
  wave: OscillatorType,
  f: number,
  t: number,
  duration: number,
  volume: number,
  slideTo?: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(f, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.005);
  gain.gain.setValueAtTime(volume, t + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function drum(c: AudioContext, out: AudioNode, filter: BiquadFilterType, f: number, t: number, duration: number, volume: number) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const biquad = c.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = f;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(biquad).connect(gain).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
}

/** Alle Stimmen eines Sechzehntels planen. */
function scheduleStep(p: Playing, c: AudioContext, t: number) {
  const { song, bus } = p;
  const sixteenth = 60 / song.bpm / 4;
  const bar = Math.floor(p.step / STEPS_PER_BAR);
  const inBar = p.step % STEPS_PER_BAR;

  const note = p.lead.get(p.step);
  if (note) {
    const d = note.length * sixteenth * 0.92;
    voice(c, bus, "square", note.freq, t, d, 0.07);
    // Leicht verstimmte zweite Stimme macht den Klang breiter.
    voice(c, bus, "square", note.freq * 1.004, t, d, 0.035);
  }

  if (inBar % 2 === 0) {
    const interval = song.bass[inBar / 2];
    if (interval !== null) {
      const f = freq(song.roots[bar % song.roots.length]) * 2 ** (interval / 12);
      voice(c, bus, "triangle", f, t, sixteenth * 1.8, 0.28);
    }
  }

  if (song.arps.length > 0) {
    const chord = song.arps[bar % song.arps.length];
    voice(c, bus, "square", freq(chord[inBar % chord.length]), t, sixteenth * 0.8, 0.025);
  }

  if (song.kick.includes(inBar)) voice(c, bus, "sine", 150, t, 0.18, 0.5, 40);
  if (song.snare.includes(inBar)) {
    drum(c, bus, "bandpass", 1800, t, 0.14, 0.32);
    voice(c, bus, "triangle", 220, t, 0.06, 0.12, 120);
  }
  if (song.hat.includes(inBar)) drum(c, bus, "highpass", 7000, t, 0.03, inBar % 4 === 2 ? 0.1 : 0.06);
}

function tick() {
  const p = playing;
  const a = audioContext();
  if (!p || !a) return;
  const sixteenth = 60 / p.song.bpm / 4;
  // Nach einer Pause (z. B. Tab im Hintergrund) nicht alle verpassten Noten auf einmal spielen.
  if (p.nextTime < a.ctx.currentTime - 0.1) p.nextTime = a.ctx.currentTime + 0.05;
  while (p.nextTime < a.ctx.currentTime + LOOKAHEAD) {
    scheduleStep(p, a.ctx, p.nextTime);
    p.nextTime += sixteenth;
    p.step = (p.step + 1) % p.totalSteps;
  }
}

export const music = {
  /**
   * Kampfmusik für `owner` (die Kampfszene) starten. Läuft dasselbe Stück
   * schon, spielt es nahtlos weiter und gehört ab jetzt dem neuen Besitzer.
   */
  start(boss: boolean, owner: object) {
    const song = boss ? BOSS : BATTLE;
    if (playing && current === song) {
      playing.owner = owner;
      return;
    }
    if (playing) fadeOut(playing, 0.2);
    const a = audioContext();
    if (!a) return;
    const bus = a.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, a.ctx.currentTime);
    bus.gain.setTargetAtTime(musicLevel() || 0.0001, a.ctx.currentTime, 0.3);
    bus.connect(a.out);
    current = song;
    playing = {
      song,
      lead: new Map(parseLead(song.lead).map((n) => [n.step, n])),
      totalSteps: song.roots.length * STEPS_PER_BAR,
      step: 0,
      nextTime: a.ctx.currentTime + 0.1,
      timer: window.setInterval(tick, TICK_MS),
      bus,
      owner,
    };
    tick();
  },

  /**
   * Musik ausblenden (Sekunden) – aber nur, wenn sie `owner` gehört. Sonst würde
   * eine alte Szene, die Phaser erst einen Frame später abbaut (z. B. durch
   * Reacts StrictMode), die Musik der neuen Szene abwürgen.
   */
  stop(owner: object, fade = 0.6) {
    if (playing && playing.owner === owner) fadeOut(playing, fade);
  },
};

function fadeOut(p: Playing, fade: number) {
  playing = null;
  current = null;
  window.clearInterval(p.timer);
  const now = p.bus.context.currentTime;
  p.bus.gain.cancelScheduledValues(now);
  p.bus.gain.setValueAtTime(p.bus.gain.value, now);
  p.bus.gain.linearRampToValueAtTime(0, now + fade);
  window.setTimeout(() => p.bus.disconnect(), fade * 1000 + 300);
}
