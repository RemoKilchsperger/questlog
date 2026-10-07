# Koop-Dungeons – Plan

Die vier Dungeons lassen sich auch gemeinsam spielen: 2–4 Helden kämpfen sich durch dieselben
Gegner wie solo, nacheinander und ohne Heilung dazwischen. Gebaut auf dem bestehenden Koop-Kampf
(`docs/koop-kampf.md`): Lobby, Einladungslink, Server, Rundenablauf, Bedrohung und Wiederbeleben
bleiben unverändert.

Status: **umgesetzt.** Edge Function muss neu deployt werden (siehe 4.).

---

## 1. Entschiedene Spielregeln

| Thema | Entscheidung |
|---|---|
| Inhalt | Die vier bestehenden Dungeons mit ihren Gegnern, Werte wachsen mit der Gruppengrösse |
| Gruppengrösse | 2–4 Spieler, Mindestlevel wie solo (der Ersteller muss es erreicht haben) |
| Kosten | Wie solo: 1 Kampfpunkt pro Kampf, alle beim Start bezahlt |
| Zwischen den Kämpfen | Lebenspunkte werden mitgenommen, Mana ist wieder voll. Gefallene stehen mit 25 % LP wieder auf |
| Weiter oder aussteigen | Der Host entscheidet nach jedem Sieg: weiter zum nächsten Kampf oder mit der Truhe aussteigen |
| Beute | Jeder hat seine eigene Truhe, gefüllt wie solo. Ausgezahlt am Ende oder beim Aussteigen |
| Niederlage | Fallen alle, sind die Truhen aller Spieler verloren |
| Belohnungsfaktor | Kein Koop-Bonus – die Gruppe hat es ohnehin leichter |
| Erfolge | Ein abgeschlossener Koop-Dungeon zählt wie solo („Dungeonläufer“, besiegte Bosse) und als Koop-Sieg |

## 2. Ablauf aus Spielersicht

1. Im Koop-Bereich gibt es neben den Koop-Bossen eine Liste **„Dungeons“**. Lobby erstellen,
   einladen und „Bereit“ funktionieren wie bisher.
2. Beim Start zahlt jeder die Kampfpunkte des ganzen Dungeons.
3. Nach jedem Sieg erscheint ein **Zwischenbildschirm**: Lebenspunkte der Gruppe, die eigene Truhe,
   nächster Gegner. Der Host wählt **„Weiter“** oder **„Mit Truhe aussteigen“**, die anderen sehen,
   worauf gewartet wird.
4. Nach dem Endboss oder beim Aussteigen öffnet jeder seine Truhe (gleiche Animation wie solo).

## 3. Spielregeln im Detail

### 3.1 Gegner-Werte für die Gruppe

Dungeon-Gegner sind auf einen Helden abgestimmt. In der Gruppe teilen sich die Helden den Schaden
und greifen alle an, deshalb wachsen beide Werte:

- Lebenspunkte: `Solo-Wert × n × (1 + 0.1 · (n − 1))`
- Schaden: `Solo-Wert × (1 + 0.4 · (n − 1))`

Ziel der Abstimmung: Ein Dungeon soll für eine Gruppe ähnlich schwer sein wie solo mit gleicher
Ausrüstung – eher etwas leichter, weil Wiederbeleben und Bollwerk dazukommen.

Abgestimmt per Simulation (Helden auf Boss-Level, Ausrüstung auf Boss-Level, je 3 Heiltränke,
einfache KI), mit den Boss-Fähigkeiten auf die ganze Gruppe (3.2). Siegchance für den ganzen Dungeon:

| Epische Ausrüstung | Solo | Duo | Trio | Vier |
|---|---|---|---|---|
| Verlassene Mine | 0–65 % | 9–69 % | 54 % | 29 % |
| Versunkener Tempel | 64–99 % | 91–100 % | 97 % | 91 % |
| Gewitterturm | 50–79 % | 86–96 % | 93 % | 94 % |
| Abgrund der Leere | 1–8 % | 50–93 % | 87 % | 88 % |

Mit seltener Ausrüstung bleibt der Gewitterturm solo wie in der Gruppe fast unschaffbar (0–4 %).
Ohne den Zuschlag auf die Lebenspunkte wurden grössere Gruppen deutlich leichter (zu viert fast 100 %).

### 3.2 Boss-Fähigkeiten

Jeder Dungeon-Boss hat zwei Fähigkeiten, die sich alle 3 Runden abwechseln – erst eine gegen ein
Ziel, dann eine gegen die Gruppe. Solo treffen beide den Helden, jede hat ihre eigene Animation.

| Boss | Gegen ein Ziel (Runde 3, 9, …) | Gegen die Gruppe (Runde 6, 12, …) |
|---|---|---|
| Erzkönig Grimmbart | ⛏️ Spitzhackenhieb: 2× Schaden, Blutung | 🪨 Erzlawine: 2×, ignoriert Rüstung |
| Hohepriesterin Neferet | ☀️ Sonnenspeer: 2×, ignoriert Rüstung | 𓂀 Fluch der Mumie: Gift, raubt Mana |
| Sturmfürst Kaelthar | 🌩️ Donnerschlag: 2,4×, ignoriert Rüstung | ⚡ Kettenblitz: 3 Treffer |
| Leerenfürst Xal'Zar | 🌀 Leerenschlund: 1,6×, heilt sich, raubt Mana | 🌑 Leerenwelle: 1,4×, heilt sich, raubt Mana |

Im Koop trifft die erste das Ziel mit der höchsten Bedrohung (mit Gruppenzuschlag wie ein normaler
Angriff), die zweite wie bei den Raid-Bossen **die ganze Gruppe**:

- Jeder Held bekommt den Schaden wie solo (ohne den Gruppenzuschlag aus 3.1) × 0,75 – auch Gift
  und andere Nachwirkungen rechnen mit dem Solo-Schaden.
- Lebensentzug teilt sich auf die Getroffenen auf, sonst heilte sich der Boss zu viert vierfach.

Dafür lernt die Koop-Logik die Effekte, die bisher nur solo vorkamen: mehrere Treffer, Brand,
Bluten und Lebensentzug.

Verlauf: Zuerst hatte jeder Dungeon-Boss eine Fähigkeit gegen ein Ziel – im Test sah das wie ein
Fehler aus. Dann traf sie alle; ohne den Faktor 0,75 und mit Gruppenzuschlag wurden grössere Gruppen
fast chancenlos. Jetzt zwei Fähigkeiten im Wechsel; die neuen sind so stark gewählt, dass die
Solo-Dungeons etwa gleich schwer bleiben wie vorher (Simulation).

### 3.3 Zufällige Beute, die beim Neuladen gleich bleibt

Jeder würfelt seine Beute selbst, mit einem Startwert aus Kampf, Gegner und Spieler. So zeigt der
Zwischenbildschirm schon den echten Inhalt der Truhe, und nach einem Neuladen ist er derselbe.

## 4. Technik

| Teil | Änderung |
|---|---|
| `domain/coopCombat.ts` | Gegner allgemein statt nur Koop-Boss (`getCoopEnemy`), Skalierung für Dungeon-Gegner, neue Effekte der Boss-Fähigkeiten, `state.dungeon` mit Stufe, Übergang zum nächsten Kampf (`nextDungeonStage`) |
| `coop/protocol.ts`, `coop/server.ts` | Neue Befehle `next` und `exit` (nur Host). `boss_id` enthält bei Dungeons die Dungeon-Id |
| Datenbank | **Keine Migration nötig** – Dungeon-Fortschritt liegt im Kampfzustand (`state`) |
| Edge Function | Muss neu gebaut und deployt werden (`npm run functions:deploy`), weil sie die Server-Logik mitbringt |
| `coop/coopStore.ts` | Kosten pro Dungeon, Truhe am Ende gutschreiben, Truhe bei Niederlage verwerfen |
| `components/CoopScreen.tsx` | Dungeon-Auswahl, Zwischenbildschirm, Truhe am Ende |
| `game/CoopBattleScene.ts` | Gegner aus `getCoopEnemy`, neuer Gegner pro Kampf |
| Tests | Logik (Skalierung, Übergang, Wiederaufstehen, neue Effekte), Server (`next`/`exit`, nur Host) |

## 5. Bekannte Grenzen

- Wie bei den Koop-Bossen bekommt nur Beute, wer das Ende des Kampfs im Browser miterlebt.
  Wer die Seite schliesst und erst später zurückkommt, geht leer aus.
