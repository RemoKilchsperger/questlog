# Questlog – gamifizierte To-do-App

To-dos sind Quests: Je nach Zeitaufwand bringen sie unterschiedlich viel **XP**, **Gold** und
**Kampfpunkte**. Mit dem Helden geht es in rundenbasierte Kämpfe, Dungeons und Koop-Raids.
Eine Erklärung für Spieler gibt es in der App im Tab **❓ Hilfe**.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm test         # Tests der Spiellogik (Vitest)
npm run build    # Produktions-Build
```

Benötigt Node.js 20.19+ oder 22.12+.

**Online-Funktionen** (Login, Cloud-Spielstand, Rangliste, Koop): `.env.example` nach `.env.local`
kopieren und mit den Supabase-Werten füllen. Ohne diese Werte läuft die App rein lokal.
Der Koop-Server läuft als Supabase Edge Function (`npm run functions:deploy`).

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand (State, gespeichert im localStorage) ·
Motion (Animationen) · Phaser 3 (Kampfszene) · Supabase (Cloud, Rangliste, Koop) · Vitest

## Struktur

```
src/
  domain/            Reine Spiellogik ohne UI – getestet, kann 1:1 auf den Server
    types.ts         Quest, Character, Item, Stats …
    rewards.ts       Belohnungstabelle (Aufwand → XP/Gold/Kampfpunkte), Bereiche → Attribute
    recurrence.ts    Wiederkehrende Quests und Serien
    bonusQuests.ts   Tägliche Bonusquests
    leveling.ts      Level-Kurve, Attributpunkte
    battlePoints.ts  Kampfpunkte: Kosten, Auffüllen, Gratispunkte
    skills.ts        Skilltree pro Waffentyp, Freischalten von Fähigkeiten
    abilities.ts     Kampf-Fähigkeiten (zwei pro Waffentyp), Mana
    items.ts         Item-Katalog, Seltenheit, Boss-Items, Verbesserungsstufen
    armorClasses.ts  Leichte, mittlere und schwere Rüstung
    heroClasses.ts   Klassen aus Rüstungsklasse + Waffe
    bossSets.ts      Set-Boni für Boss-Items
    gearScore.ts     Gear Score
    equipment.ts     Anlegen/Ablegen, Kampfwerte der Ausrüstung
    loot.ts          Item-Drops bei Quests und Kämpfen
    shop.ts          Händler mit wechselndem Angebot
    forge.ts         Schmied: Zerlegen und Verbessern
    potions.ts       Heil- und Verstärkungstränke
    creatures.ts     Gebiete, Dungeons, Kreaturen, Beute
    bossAbilities.ts Fähigkeiten der Solo-Bosse
    combat.ts        Rundenbasierter Kampf, Kampfwerte des Helden, Belohnung
    coopCombat.ts    Koop-Kampf gegen Raid-Bosse
    achievements.ts  Erfolge, Titel, Avatar-Rahmen
  store/             Zustand-Stores (Spielstand, Sound)
  cloud/             Supabase: Konto, Cloud-Spielstand, Rangliste, Profile
  coop/              Koop-Lobby, Protokoll und Server (Edge Function)
  game/              Phaser-Kampfszenen, Pixel-Grafiken, Musik und Effekte
  assets/creatures/  Gegner-Bilder (PNG 128×128, Blick nach links, Dateiname = Grafik-Schlüssel)
  components/        UI: HUD, Quests, Charakter, Skills, Ausrüstung, Dorf, Kampf, Rangliste, Hilfe
docs/                Pläne und Notizen (Koop-Kampf, Bild-Prompts für Gegner)
supabase/            Datenbankschema, Migrationen, Edge Functions
```

## Spielregeln (anpassbar in `src/domain/`)

### Quests

| Aufwand | Dauer | XP | Gold | Kampfpunkte | Item-Dropchance |
|---|---|---|---|---|---|
| Schnell | ≤ 15 Min | 10 | 2 | 1 | 5 % |
| Kurz | ~ 30 Min | 25 | 5 | 2 | 12 % |
| Mittel | ~ 1 Std | 55 | 12 | 3 | 25 % |
| Lang | ~ 2 Std | 120 | 25 | 4 | 45 % |
| Episch | 4+ Std | 260 | 55 | 6 | 75 % |

- Nur epische Quests geben einen Attributpunkt (als Bonusquest zwei) – auf das Attribut ihres Bereichs.
- Längere Quests droppen auch seltenere Items (Gewichte in `loot.ts`).
- **Bonusquests:** täglich eine pro Aufwandsstufe, +50 % XP, Gold und Dropchance.
- **Wiederkehrende Quests:** Wer pünktlich erledigt, verlängert die Serie. Jede Stufe über 1 gibt
  +5 % XP und Gold, höchstens +50 %.

| Bereich | Attribut |
|---|---|
| ⚔️ Körper | Stärke |
| 📜 Geist | Intelligenz |
| 🛡️ Alltag | Ausdauer |
| 🎭 Sozial | Charisma |

### Level, Skills und Kampfpunkte

- Level-Kurve: Für Level *n* → *n+1* braucht es `100 + 25 · (n − 1)` XP. Maximallevel 60 nach 48’675 XP.
- Pro Level-up: 2 Attributpunkte und 1 Skillpunkt.
- **Skills:** pro Waffentyp (inkl. Schild) 5 Ränge à +2 % Waffenschaden (Schild: +2 % Schild-Rüstung).
  Nach Rang 5 schaltet 1 Skillpunkt die erste Fähigkeit frei, ab Level 25 schalten 2 Punkte die zweite frei.
  Zurücksetzen kostet `25 · Level · (1 + Level / 10)` Gold.
- **Kampfpunkte:** Start 5, Maximum 20. Jeder Kampf kostet 1, Dungeons 1 pro Kampf, Koop 3.
  Quests füllen auf, dazu gibt es alle 6 Stunden einen Punkt geschenkt.

### Items

16 Typen mit je 200 Items, verteilt über Level 1–60 (`items.ts`), Rüstungsteile zusätzlich in drei Rüstungsklassen:

- **Rüstung:** Helm, Brust, Armschutz, Beine, Schuhe
- **Waffen:** Dolch, Schwert, Zweihandschwert, Schild, Axt, Grossaxt, Stab, Zepter, Streitkolben,
  Grosshammer, Bogen
- **Zweihandwaffen** (Zweihandschwert, Grossaxt, Stab, Grosshammer, Bogen) belegen beide Hände.
- **Schilde** kommen in eine Waffenhand und geben Angriff und Rüstung. Es darf nur ein Schild getragen werden.

| Seltenheit | Rüstung/Angriff | Attributboni | Preis |
|---|---|---|---|
| Gewöhnlich | × 1 | – | × 1 |
| Selten | × 1.2 | 1 Attribut | × 2 |
| Episch | × 1.45 | 2 Attribute | × 4 |
| Legendär | × 1.75 | 3 Attribute | × 8 |

Höhe eines Bonus: `Faktor · (1 + Item-Level / 4)` mit Faktor 1 / 1.5 / 2.5 (selten / episch / legendär).

| Rüstungsklasse | Rüstung | Ausgleich pro Teil |
|---|---|---|
| Leicht (Stoff) | 50 % | +4 Mana, +0,6 % Krit |
| Mittel (Leder) | 75 % | +0,4 % Krit |
| Schwer (Metall) | 100 % | – |

- **Klassen** (`heroClasses.ts`): mindestens 3 Rüstungsteile einer Klasse plus passende Waffe, z. B.
  leichte Rüstung + Stab → Magier. 11 Klassen, höchstens eine aktiv.
- **Boss-Items:** einzigartig und immer legendär, 10 % Chance pro Bosssieg. Mehrere Teile desselben
  Bosses geben Set-Boni (`bossSets.ts`).
- **Gear Score:** Durchschnitt aus `Item-Level × Seltenheitsfaktor × (1 + 2 % pro Schmied-Stufe)`
  über alle 7 Plätze. Eine Zweihandwaffe zählt doppelt.

### Dorf

- **Händler** (`shop.ts`): 8 Items passend zum Level, alle 4 Stunden neu, bis zu 5-mal täglich gegen
  Gold neu auswürfeln. Seltenheit pro Stück: 20 % selten, 5 % episch, 0,2 % legendär.
  Verkauf für 25 % des Preises.
- **Schmied** (`forge.ts`): Items ab „selten“ zu Essenz zerlegen. Mit Essenz den Hauptwert verbessern
  (Waffen Angriff, Rüstungen und Schilde Rüstung), +6 % pro Stufe bis +5.
  Beim Zerlegen gibt es 50 % der investierten Essenz zurück.

### Kampf

Rundenbasiert. Pro Runde: optional **ein Trank** (jede Sorte einmal pro Kampf), dann **Angriff oder
Fähigkeit**, danach Gift/Feuer/Bluten und der Gegenangriff. Jeder Kampf beginnt mit vollen Lebenspunkten.

| Wert | Formel (in `combat.ts`) |
|---|---|
| Lebenspunkte | `80 + 12 · (Level − 1) + 1.5 · Ausdauer` |
| Schaden | `5 + Angriff + Skill-Bonus + Attributbonus der Waffen`, ±15 % Streuung |
| Attributbonus | `0.25 · Attribut der Waffe` (Ausdauer 0.15), bei zwei Waffen nach Anteil am Angriff |
| Kritisch | `5 % + 0.2 % · Charisma` (max. 30 %), ×1.5 Schaden |
| Mana | `40 + 2 · (Level − 1) + Intelligenz`, +6 pro Runde |
| Rüstung | fängt `Rüstung / (Rüstung + 50 + 10 · Angreifer-Level)` des Schadens ab |
| Gold-Bonus | `+0.5 % · Charisma` (max. +100 %) |

**Waffen skalieren mit Attributen** (`weaponScaling.ts`, Plan in `docs/attribut-skalierung.md`):
Stärke – Schwert, Zweihandschwert, Axt, Grossaxt, Grosshammer · Intelligenz – Stab, Zepter ·
Ausdauer – Streitkolben, Schild (auch `+0.1 · Ausdauer` Rüstung pro Schild) · Charisma – Dolch, Bogen.
Attributpunkte lassen sich zurücksetzen: das erste Mal kostenlos, danach `50 · Level · (1 + Level / 10)` Gold.

Klassen, Boss-Sets und leichte Rüstung kommen jeweils noch dazu.

- **Sieg:** XP (8 % des Levelbedarfs der Kreatur, Bosse ×3), 40 % Chance auf Gold, 35 % auf ein Item,
  25 % auf einen Heiltrank, 6 % auf einen Verstärkungstrank. Bosse geben immer Gold (×4), ein Item und
  zwei Tränke. Bosse setzen alle paar Runden eine angekündigte Fähigkeit ein.
- **Flucht:** jederzeit möglich, kostet die durchschnittliche Gold-Beute der Kreatur.

**Gebiete** (`creatures.ts`): Düsterwald (1–10), Nebelsümpfe (11–20), Kristallhöhlen (21–30),
Frostgipfel (31–40), Schattenruinen (41–50), Drachenhort (51–60). Je 4 Kreaturen und ein Boss.

**Dungeons:** Verlassene Mine (ab 10), Versunkener Tempel (ab 25), Gewitterturm (ab 40),
Abgrund der Leere (ab 60). Vier Kämpfe ohne Heilung dazwischen, Beute in einer Truhe, die bei einer
Niederlage verloren geht.

**Koop** (`coopCombat.ts`, Plan in `docs/koop-kampf.md`): 2–4 Spieler gegen Sumpfhydra (20),
Frostriese (40) oder Weltenverschlinger (60). Der Boss greift nach Bedrohung an,
Gefallene lassen sich mit einem Heiltrank wiederbeleben, jeder würfelt eigene Beute (×1.5 XP und Gold).
Auch alle Dungeons gehen im Koop (Plan in `docs/koop-dungeons.md`): Gegner mit Lebenspunkten
`× n × (1 + 0.1 · (n − 1))` und Schaden `× (1 + 0.4 · (n − 1))`, Gefallene stehen zwischen den Kämpfen
mit 25 % LP auf, der Host entscheidet nach jedem Sieg über Weiter oder Aussteigen, jeder hat seine eigene Truhe.
Dungeon-Bosse haben zwei Fähigkeiten im Wechsel (`bossAbilities.ts`): eine gegen ein Ziel, eine gegen die Gruppe.
Solo treffen beide den Helden, im Koop trifft die zweite alle – jeden mit Solo-Schaden × 0.75.

**Tränke:** Kleiner Heiltrank 30 % LP und Heiltrank 60 % gibt es beim Händler. Grosser Heiltrank 100 %,
Angriffstrank (+30 % Schaden, 3 Runden) und Rüstungstrank (+100 % Rüstung, 3 Runden) gibt es nur als Beute.

**Technik:** Die Kampflogik ist reine Domain-Logik (getestet, inkl. Balance-Simulation). Die Phaser-Szene
(`src/game/BattleScene.ts`) zeichnet nur und animiert die Ereignisse, die der Store über den `EventBus`
schickt (`battle:events`), und meldet `battle:animation-done` zurück. Phaser wird erst geladen,
wenn ein Kampf beginnt.
