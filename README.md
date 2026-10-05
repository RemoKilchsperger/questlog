# Questlog – gamifizierte To-do-App

To-dos sind Quests: Je nach Zeitaufwand bringen sie unterschiedlich viel **XP** und **Gold**,
und je nach Bereich trainieren sie ein **Attribut** deines Charakters.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm test         # Tests der Spiellogik (Vitest)
npm run build    # Produktions-Build
```

Benötigt Node.js 20.19+ oder 22.12+.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand (State, gespeichert im localStorage) · Motion (Animationen) · Phaser 3 (Kampfszene) · Vitest

## Struktur

```
src/
  domain/          Reine Spiellogik, ohne UI. Kann später 1:1 aufs Backend.
    types.ts       Quest, Character, Reward, Stats …
    rewards.ts     Belohnungstabelle (Aufwand → XP/Gold), Bereiche → Attribute
    leveling.ts    Level-Kurve, Fortschritt, Titel
    items.ts       Item-Katalog (Waffen, Rüstungsteile), Slots, Preise, Seltenheit
    loot.ts        Item-Drops bei Quests und Kämpfen
    equipment.ts   Anlegen/Ablegen, Kaufen/Verkaufen, Rüstung & Angriff
    combat.ts      Rundenbasierter Kampf, Kampfwerte des Helden, Belohnung
    creatures.ts   Gebiete, Kreaturen, Bosse
    potions.ts     Heiltränke
    *.test.ts      Tests
  store/
    gameStore.ts   Zustand-Store: Quests, Charakter, Ausrüstung, Tränke, Kampf
  game/
    EventBus.ts    Brücke zwischen React und der Phaser-Kampfszene
    BattleScene.ts Phaser-Szene (Darstellung und Animation)
    sprites.ts     Pixel-Grafiken aus Text-Rastern, automatischer Umriss
    creatureSprites.ts  Eigene 16×16-Grafiken für alle 30 Kreaturen
    heroSprite.ts  Grafik des Helden
    PhaserBattle.tsx  Bettet Phaser in React ein
  components/      UI: HUD, Quests, Charakterbogen, Ausrüstung, Händler, Kampf
```

## Spielregeln (anpassbar in `src/domain/`)

| Aufwand | Dauer | XP | Gold | Attributpunkte | Item-Dropchance |
|---|---|---|---|---|---|
| Schnell | ≤ 15 Min | 10 | 2 | 1 | 5 % |
| Kurz | ~ 30 Min | 25 | 5 | 1 | 12 % |
| Mittel | ~ 1 Std | 55 | 12 | 2 | 25 % |
| Lang | ~ 2 Std | 120 | 25 | 3 | 45 % |
| Episch | 4+ Std | 260 | 55 | 5 | 75 % |

Längere Quests droppen zudem eher seltene Items (Gewichte in `src/domain/loot.ts`).

| Seltenheit | Rüstung/Angriff | Attributboni | Verkaufswert |
|---|---|---|---|
| Gewöhnlich | × 1 | – | × 1 |
| Selten | × 1.2 | 1 Attribut | × 2 |
| Episch | × 1.45 | 2 Attribute | × 4 |
| Legendär | × 1.75 | 3 Attribute | × 8 |

Höhe eines Bonus: `Faktor · (1 + Item-Level / 4)` mit Faktor 1 / 1.5 / 2.5 (selten / episch / legendär).
Der Händler verkauft nur gewöhnliche Ware.

| Bereich | Attribut |
|---|---|
| ⚔️ Körper | Stärke |
| 📜 Geist | Intelligenz |
| 🛡️ Alltag | Ausdauer |
| 🎭 Sozial | Charisma |

Level-Kurve: Für Level *n* → *n+1* braucht es `100 + 25 · (n − 1)` XP (100, 125, 150 … 1550).
Maximallevel 60 nach insgesamt 48’675 XP.

### Items

15 Typen mit je 200 Items (3000 insgesamt), verteilt über Level 1–60, erzeugt in `src/domain/items.ts`:

- **Rüstung:** Helm, Brust, Armschutz, Beine, Schuhe
- **Waffen:** Dolch, Schwert, Zweihandschwert, Schild, Axt, Grossaxt, Stab, Zepter, Streitkolben, Grosshammer
- **Zweihandwaffen** (Zweihandschwert, Grossaxt, Stab, Grosshammer) belegen beide Hände.
- **Schilde** kommen in eine Waffenhand, geben aber Rüstung statt Angriff. Es darf nur ein Schild
  getragen werden – ein zweiter ersetzt den ersten.
- **Namen:** 20 Materialstufen (Rost … Götter) × 10 Beinamen (des Wanderers … der Könige),
  z. B. „Drachenbihänder der Ahnen“.

## Kampf

Rundenbasiert. Pro Runde: optional **ein Trank**, dann **ein Angriff**, danach schlägt die Kreatur zurück.
Jeder Kampf beginnt mit vollen Lebenspunkten.

- **Sieg:** 40 % Chance auf Gold (50–150 % von `3 + Level`), 35 % auf ein Item, 25 % auf einen Trank.
  Bosse geben immer Gold (×4), ein Item und zwei Tränke.
  Trank-Stufe nach Gebiet: bis Lv. 20 klein, bis Lv. 40 mittel, darüber gross.
- **Flucht:** jederzeit möglich, kostet die durchschnittliche Gold-Beute der Kreatur (höchstens das vorhandene).

| Wert | Formel (in `src/domain/combat.ts`) |
|---|---|
| Lebenspunkte | `80 + 12 · (Level − 1) + 1.5 · Ausdauer` |
| Schaden | `5 + Angriff der Waffen + 0.25 · Stärke`, ±15 % Streuung |
| Kritisch | `5 % + 0.2 % · Intelligenz` (max. 30 %), ×1.5 Schaden |
| Rüstung | fängt `Rüstung / (Rüstung + 50 + 10 · Angreifer-Level)` des Schadens ab |
| Gold-Bonus | `+0.5 % · Charisma` (max. +100 %) |

**Gebiete** (`src/domain/creatures.ts`): Düsterwald (1–10), Nebelsümpfe (11–20), Kristallhöhlen (21–30),
Frostgipfel (31–40), Schattenruinen (41–50), Drachenhort (51–60). Je 4 Kreaturen und ein Boss;
ein Gebiet öffnet sich ab seinem Mindestlevel.

**Tränke** (beim Händler): Kleiner Heiltrank 30 % LP, Heiltrank 60 %, Grosser Heiltrank 100 %.

**Technik:** Die Kampflogik ist reine Domain-Logik (getestet, inkl. Balance-Simulation). Die Phaser-Szene
(`src/game/BattleScene.ts`) zeichnet nur und animiert die Ereignisse, die der Store über den `EventBus`
schickt (`battle:events`), und meldet `battle:animation-done` zurück. Phaser wird erst geladen,
wenn ein Kampf beginnt.
