# Koop-Kampf – Plan

Mehrere Spieler kämpfen gemeinsam gegen einen Koop-Boss. Pro Runde handeln
zuerst alle Spieler, danach greift der Boss an.

Status: **Etappe 1 und 2 live, Etappe 3 umgesetzt** (Branch `feature/koop-etappe-3`).
Zahlen sind Startwerte und werden beim Testen abgestimmt.

---

## 1. Entschiedene Spielregeln

| Thema | Entscheidung |
|---|---|
| Gruppengrösse | 2–4 Spieler |
| Gegner | Eigene Koop-Bosse. Die bestehenden Bosse bleiben Solo-Inhalt |
| Rundenablauf | Spielerphase (alle wählen gleichzeitig) → Auflösung → Bossphase |
| Zeitlimit | 30 Sekunden pro Spielerphase. Wer nicht wählt, greift normal an |
| Boss-Ziel | Bedrohung: meist der Spieler mit der höchsten Bedrohung, mit etwas Zufall. Boss-Fähigkeiten treffen alle |
| Niederlage | Wer auf 0 LP fällt, ist kampfunfähig und kann von Mitspielern wiederbelebt werden. Fallen alle, ist der Kampf verloren |
| Beute | Jeder würfelt seine eigene, volle Beute |
| Kosten | Kampfpunkte wie bei Dungeons, bezahlt beim Kampfstart |
| Technik | Etappe 1: Der einladende Spieler (Host) rechnet. Etappe 2: Umzug auf eine Supabase Edge Function |

---

## 2. Ablauf aus Spielersicht

1. **Kampf erstellen:** Im Kampf-Tab gibt es einen neuen Bereich **„Koop-Bosse“**.
   Ein Spieler wählt einen Boss und erstellt eine Lobby. Dafür ist ein Cloud-Login nötig.
2. **Einladen:** Die Lobby hat einen kurzen Code und einen teilbaren Link
   (`#/koop/<code>`). Mitspieler öffnen den Link und treten bei.
3. **Lobby:** Alle sehen die Teilnehmer mit Avatar, Level und Ausrüstungswerten. Jeder
   klickt **„Bereit“**. Der Host startet, sobald mindestens 2 Spieler bereit sind.
4. **Start:** Jeder Spieler zahlt seine Kampfpunkte (siehe 3.5). Wer zu wenige hat,
   kann nicht „Bereit“ klicken.
5. **Runden:** Jeder wählt seine Aktion: Angriff, Fähigkeit, Trank für sich selbst
   oder Trank auf einen gefallenen Mitspieler (Wiederbelebung). Ein Countdown zeigt die
   restliche Zeit, Häkchen zeigen, wer schon gewählt hat. Danach spielen alle
   dieselbe Animation ab.
6. **Ende:**
   - **Sieg:** Jeder bekommt seine eigene Beute.
   - **Niederlage:** Alle Spieler sind gefallen, niemand bekommt Beute.
   - **Gefallene Spieler** bekommen bei einem Sieg trotzdem die volle Beute.

---

## 3. Spielregeln im Detail

### 3.1 Koop-Bosse (neuer Inhalt)

Die Bosse sind auf 2 Spieler ausgelegt und skalieren nach oben. Es sind Vorschläge,
Namen und Werte stehen noch offen.

| Boss | Level | Idee |
|---|---|---|
| Sumpfhydra | 20 | Mehrere Köpfe: Giftatem trifft alle, Biss trifft das Ziel |
| Frostriese | 40 | Stampfer trifft alle, Eiskerker betäubt einen Spieler für eine Runde |
| Weltenverschlinger | 60 | Leerenstrudel trifft alle und raubt Mana, Lebensentzug am Ziel |

- Boss-Fähigkeiten funktionieren wie bei den Solo-Bossen: alle N Runden, eine
  Runde vorher angekündigt.
- **Eigene Beute:** Jeder Koop-Boss hat eigene einzigartige Items, ein kleines
  Raid-Set. Das kommt in Etappe 3, bis dahin gibt es normale Boss-Beute.

### 3.2 Skalierung nach Spielerzahl (n = 2–4)

- Lebenspunkte: `Basis × n / 2` (zu viert doppelt so viele wie zu zweit)
- Schaden: `Basis × (1 + 0.1 × (n − 2))`
- Werte der Spieler bleiben unverändert (ihre eigenen Kampfwerte).

### 3.3 Bedrohung (Boss-Ziel)

- Jeder Spieler hat einen Bedrohungswert, gestartet wird bei 0.
- Verursachter Schaden erhöht die Bedrohung um den Schadenswert, auch Gift, Feuer und Bluten.
- **Bollwerk (Schild)** erhöht zusätzlich die Bedrohung stark, um +50 % des
  höchsten Werts der Gruppe. Der Schildträger zieht den Boss auf sich und blockt
  den nächsten Angriff. Das ist die neue Tank-Rolle.
- Gefallene Spieler haben keine Bedrohung.
- Zielwahl: 70 % der Spieler mit der höchsten Bedrohung, 30 % ein zufälliger lebender Spieler.
- Boss-Fähigkeiten mit „trifft alle“ ignorieren die Bedrohung.

### 3.4 Gefallen und Wiederbeleben

- Bei 0 LP ist ein Spieler **kampfunfähig**. Er wählt keine Aktion und wird nicht angegriffen.
  Gift, Feuer und Bluten enden.
- **Wiederbeleben:** Ein Mitspieler nutzt einen Heiltrank auf den Gefallenen statt
  auf sich selbst. Das zählt als sein Trank der Runde. Der Gefallene steht mit der
  Heilwirkung des Tranks wieder auf, also 30, 60 oder 100 % seiner LP.
- Pro Kampf kann jeder Spieler höchstens einmal wiederbelebt werden.

### 3.5 Kosten und Belohnung

- Kosten: **3 Kampfpunkte** pro Spieler, bezahlt beim Start. Bei einem Abbruch
  durch den Host in Etappe 1 werden sie zurückerstattet.
- Beute pro Spieler, unabhängig voneinander gewürfelt:
  - XP und Gold wie ein Solo-Boss gleichen Levels × 1,5. Koop ist aufwändiger.
  - Garantierter Item-Drop mit Boss-Gewichten.
  - 10 % Chance auf ein einzigartiges Koop-Boss-Item (ab Etappe 3).
- Die Beute wird jedem Spieler wie bei Dungeons über eine **Truhe** angezeigt.

### 3.6 Was aus dem Solo-Kampf übernommen wird

- Mana, Fähigkeiten, Tränke (einer pro Runde, jede Sorte einmal pro Kampf),
  Gift, Feuer, Bluten, Rüstungsbruch, Betäubung.
- **Betäubung:** Ein betäubter Boss setzt seine ganze Bossphase aus. Das ist stark, deshalb
  wird pro Kampf nur die erste Betäubung voll wirksam, jede weitere hat 50 % Chance.

---

## 4. Technik

### 4.1 Domain (reine Logik, wie bisher)

Neue Datei `src/domain/coopCombat.ts`, die möglichst viel aus `combat.ts`
wiederverwendet (`rollHit`, Status-Effekte, Boss-Fähigkeiten):

```ts
interface CoopBattleState {
  id: string;
  bossId: string;
  round: number;
  phase: "choose" | "resolving" | "finished";
  /** Ende der Spielerphase (Zeitstempel, ms) */
  deadline: number;
  heroes: CoopHero[];          // je Spieler: Kampfwerte, LP, Mana, Effekte, Bedrohung, gefallen?
  boss: Combatant & { effects: … };
  status: "active" | "won" | "lost";
}

type CoopAction =
  | { type: "attack" }
  | { type: "ability"; weapon: SkillWeapon }
  | { type: "potion"; potionId: string; targetId?: string }; // targetId = Wiederbelebung

startCoopBattle(heroes, boss, rng): CoopBattleState
resolveRound(state, actions: Record<playerId, CoopAction>, rng): { state; events: CoopEvent[] }
```

- `BattleEvent` bekommt Akteur und Ziel (`actorId`, `targetId`), damit die Szene
  weiss, welcher Held handelt.
- Fehlende Aktionen nach Ablauf der Zeit werden in `resolveRound` als `attack` gewertet.
- Alles mit Vitest testbar: Skalierung, Bedrohung, Zielwahl, Wiederbeleben,
  Sieg und Niederlage, Zeitablauf.

### 4.2 Etappe 1: Host im Browser + Supabase Realtime

- Pro Lobby ein Realtime-Kanal `koop:<code>`.
  - **Presence:** wer ist da, bereit, verbunden.
  - **Broadcast-Nachrichten:**

| Nachricht | Von → an | Inhalt |
|---|---|---|
| `join` | Spieler → alle | Name, Avatar-Ausrüstung, Kampfprofil (`getHeroCombatProfile`) |
| `ready` | Spieler → alle | bereit ja/nein |
| `start` | Host → alle | Startzustand |
| `action` | Spieler → Host | gewählte Aktion der Runde |
| `round` | Host → alle | neuer Zustand + Ereignisse der Runde |
| `end` | Host → alle | Ergebnis |

- Der **Host** ist die einzige Instanz, die `resolveRound` ausführt. Er löst aus, sobald alle
  gewählt haben oder die 30 Sekunden um sind.
- **Beute:** Am Ende würfelt jeder Client seine eigene Beute lokal und schreibt sie
  wie gewohnt in seinen Spielstand.
- **Verbindungsabbruch eines Spielers:** Sein Held kämpft mit automatischen
  Angriffen weiter. Kehrt er zurück, übernimmt er wieder.
- **Host verlässt den Kampf:** Der Kampf wird abgebrochen und die Kampfpunkte
  werden erstattet. Eine Übergabe an einen anderen Spieler ist zu aufwändig für Etappe 1.
- **Bekannte Schwäche:** Ein Spieler könnte sein Kampfprofil manipulieren. Das ist für
  Etappe 1 (nur mit Freunden) akzeptiert.

### 4.3 Etappe 2: Server (Supabase Edge Function)

- Tabelle `coop_battles` (Zustand als `jsonb`, Versionsnummer, Teilnehmer) mit RLS:
  Nur Teilnehmer dürfen lesen.
- Edge Functions `coop-create`, `coop-join`, `coop-act`. Die Function führt
  `resolveRound` aus. Die Domain-Logik ist schon framework-frei und kann direkt
  importiert werden.
- **Kampfwerte vom Server:** Das Heldenprofil wird aus dem Cloud-Spielstand
  (`saves`) berechnet, nicht vom Client geschickt.
- **Zeitlimit:** Jede Aktion und ein leichter Client-Ping prüfen die `deadline`.
  Ist sie überschritten, löst der Server die Runde auf.
- Clients abonnieren Änderungen an ihrer Zeile über Realtime (Postgres Changes).
- **Offen:** Die Beute läuft weiter lokal. Wirklich fälschungssicher wird es erst,
  wenn Belohnungen generell serverseitig vergeben werden. Das ist ein eigenes
  Projekt, siehe Hinweis in `gameStore.ts`.

### 4.4 Darstellung

- **Phaser-Szene:** bis zu 4 Helden links, leicht versetzt in zwei Reihen und kleiner
  skaliert, der Koop-Boss rechts grösser. Pro Held ein kompakter Lebensbalken mit Namen.
  Gefallene Helden liegen am Boden.
- Bestehende Animationen (Waffen, Fähigkeiten, Boss-Angriffe) werden pro
  Akteur wiederverwendet. Neu ist ein Flächenangriff des Bosses auf alle Helden.
- **React:**
  - Lobby: Teilnehmerliste, Bereit-Status, Einladungslink.
  - Im Kampf: Aktionsleiste wie heute, dazu Countdown, Häkchen pro Spieler und
    Zielwahl für Wiederbeleben.
  - Am Ende: die Beute-Truhe.

---

## 5. Etappen

### Etappe 1: Spielbar zu zweit bis zu viert, Host-Modell
- [x] `coopCombat.ts` mit Tests: Start, Runde, Skalierung, Bedrohung, Wiederbeleben, Zeitablauf
- [x] Ein erster Koop-Boss (Sumpfhydra, Lv. 20) mit Grafik und Fähigkeiten
- [x] Realtime-Lobby: erstellen, Link, beitreten, bereit, starten
- [x] Host-Logik: Aktionen sammeln, Countdown, Runde auflösen, verteilen
- [x] Kampfszene mit mehreren Helden
- [x] Beute-Truhe pro Spieler, Kampfpunkte
- [x] Test mit zwei echten Cloud-Konten auf zwei Geräten

**Umsetzung:** `src/domain/coopCombat.ts` (Logik), `src/coop/transport.ts` (Verbindung),
`src/coop/coopStore.ts` (Lobby und Host), `src/game/CoopBattleScene.ts` (Szene),
`src/components/CoopScreen.tsx` (Oberfläche).

**Testmodus:** Im Dev-Server ohne Anmeldung verbinden sich Tabs desselben Browsers über
`BroadcastChannel`. Damit lässt sich alles ohne Konto ausprobieren. Weil sich die Tabs einen
Spielstand teilen, überschreiben sich dabei Kampfpunkte und Beute gegenseitig. Das gilt
nur im Testmodus.

### Etappe 2: Server
- [x] Tabelle `coop_battles` + RLS (`supabase/migrations/20261006120000_coop_battles.sql`)
- [x] Edge Function `coop`, Heldenprofil aus dem Cloud-Spielstand
- [x] Zeitlimit serverseitig, Wiederverbinden nach Abbruch („Zurückkehren“ im Kampf-Tab)
- [x] Host-Modell entfernt: Verlässt der Host den Kampf, kämpfen die anderen weiter
- [x] In Supabase einrichten (siehe unten) und mit zwei Konten testen

**Umsetzung:**
- `src/coop/server.ts`: Befehle auf einen Kampf-Datensatz anwenden. Rein und getestet.
- `supabase/functions/coop/index.ts`: Edge Function. Prüft die Anmeldung, lädt die Spielstände
  und speichert mit Versionsprüfung.
- `src/coop/backend.ts`: Browser-Seite (Edge Function + Realtime, lokaler Testmodus).
- `src/coop/coopStore.ts`: übernimmt den Stand vom Server, zahlt Kampfpunkte, würfelt die eigene Beute.

Gegenüber dem Plan: Statt drei Functions gibt es eine (`coop`) mit Befehlen
(create, join, ready, leave, start, act, tick). Alte Kämpfe räumt die Function nach
24 Stunden beim Erstellen einer neuen Lobby auf, ein Cron-Job ist nicht nötig.

**Einrichten in Supabase (einmalig):**
1. Vorher die Tabelle `saves` als CSV sichern (Table Editor → saves → Export).
2. SQL Editor → Inhalt von `supabase/migrations/20261006120000_coop_battles.sql` ausführen.
3. Einmal `npx supabase login` (öffnet den Browser) und `npx supabase link --project-ref <ref>`.
   `<ref>` steht in der Projekt-URL: `https://<ref>.supabase.co`.
4. `npm run functions:deploy`: bündelt die Spiellogik und lädt die Function hoch.
   Nach jeder Änderung an der Spiellogik wiederholen.

### Etappe 3: Inhalt und Feinschliff
- [x] Weitere Koop-Bosse: Frostriese Hrimgar (Lv. 40, friert einen Helden ein), Weltenverschlinger
      (Lv. 60, Manaraub, Lebensraub durch Bisse)
- [x] Raid-Sets als Koop-Beute: je 7 Teile pro Koop-Boss, Werte ×1,55 (Waffen) bzw. ×1,4 (Rüstung),
      Set-Boni wie bei Dungeons; jeder Waffentyp hat weiterhin 2–3 Boss-Waffen
- [x] Koop-Erfolge im Profil (Siege, besiegte Koop-Bosse) – im Charakterbogen und auf der Profilseite
- [ ] Edge Function neu deployen (`npm run functions:deploy`), dann mit zwei Konten testen
- [ ] Feinabstimmung der Zahlen nach Testspielen („fordernd“: mit Teamwork gut machbar)

---

## 6. Risiken und offene Fragen

- **Cloud-Login ist Pflicht** für Koop. Spieler ohne Supabase-Konfiguration sehen den
  Bereich nicht.
- **Handy im Hintergrund:** Browser drosseln Timer in Hintergrund-Tabs. Ein Host
  auf dem Handy, der die App wechselt, bremst die Gruppe. Das ist ein weiterer Grund für Etappe 2.
- **Gleichzeitiges Spielen auf zwei Geräten** mit demselben Konto: Die Beute landet
  im lokalen Spielstand und wird wie jede Änderung hochgeladen (der letzte Upload gewinnt).
  Das war vor Koop schon so. Koop verschärft es nicht, weil jeder Spieler sein eigenes Konto
  nutzt. *Geprüft vor Etappe 1.*
- **Supabase-Limits** (Realtime-Verbindungen und Nachrichten im Gratis-Tarif)
  reichen für Freundesgruppen bei Weitem.
- **Balance:** Bedrohung, Betäubung und Wiederbeleben brauchen Testspiele. Die Zahlen
  oben sind Startwerte.
