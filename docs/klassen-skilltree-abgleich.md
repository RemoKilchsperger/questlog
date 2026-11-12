# Abgleich Klassen-Neukonzept und Skilltree-Überarbeitung

Stand: 2026-11-12. Alle Fragen sind entschieden (Abschnitt 3). **G0 und G1 sind umgesetzt** (Branch
`feature/klassen-skilltree`), G2–G4 sind Plan.
Abgeglichen: docs/klassen-neukonzept.md (**[Skilltree]**-Stellen) und docs/skilltree-ueberarbeitung.md
(**[K]**-Stellen). Grundlage beider: docs/balancing-review-waffen-klassen.md („Review“).

**Ausgangslage:** Der Entwickler hat **Modell C „Klassen mit Kern“** gewählt (Klassenleiste mit 4 Ladungen,
Signaturfähigkeit ohne Mana, Rolle und mechanisches Passiv pro Klasse). Alle Konflikte sind darauf hin
entschieden. Beide Dokumente sind angepasst und widersprechen sich nicht mehr.

---

## 1. Konflikte und Entscheidungen

| # | Thema | Skilltree (alt) | Klassen (alt) | Entscheidung | Begründung | Geändert |
|---|---|---|---|---|---|---|
| 1 | Krit-Obergrenze | Scharfe Klingen, Blutgeruch „über der Obergrenze“, ohne Deckel | Gesamt-Obergrenze 60 % | **60 % gesamt** (`CRIT_CAP_TOTAL`), geprüft beim Würfeln (`strikeFactors`), weil Blutgeruch, Allsehend und Präzision erst dort dazukommen. Grund-Obergrenze 30 % bleibt | Nur die Assassine erreicht heute 60–75 %; alle anderen merken nichts. Gehört in die Sofortkorrekturen, damit der Skilltree auf der neuen Regel aufsetzt | Skilltree 3.1 (Tabelle + Absatz); Klassen 4.3 Assassine, 8 |
| 2 | Assassine Krit-Faktor | – | 2,0 (Review: 2,1) | **2,0** mit +10 % Krit | In Modell C trägt Halsschnitt einen Teil der Stärke; 2,1 war der Vorschlag ohne Signatur | Klassen 4.3 |
| 3 | Schnitter / Plünderer | Schnitter-Fix: verlängert stärkeres Bluten um 1 Runde, Offene Wunde entfällt | Plünderer-Bluten +15 Prozentpunkte mit Schnitter | **Skilltree-Fix**, keine Plünderer-Sonderregel | Der Fix löst das Problem für alle starken Bluten (Axtwurf, Spalter, Plünderer) auf einmal und bleibt klassenunabhängig | Skilltree 3.1; Klassen 4.3 Plünderer, 8 |
| 4 | Überheilungs-Schild | Lebensband 15 % (Plage-Meisterschaft) | Kleriker-Passiv „Gnade“ 10 % | **Nur Lebensband**, Gnade gestrichen | Eine Mechanik an einer Stelle; der Baum bleibt klassenunabhängig. Ein Kleriker mit Lebensband ist der stärkste Unterstützer, das ist eine Build-Entscheidung statt eines Automatismus | Skilltree 3.5; Klassen 4.3 Kleriker, 8 |
| 5 | Schild-Topf | Lebensband-Schild bis Kampfende | Paladin-Gruppenschild 10 %, 2 Runden | **Ein Topf `ward` pro Held**, alle Quellen zusammen höchstens 15 % der max. LP, verfällt am Kampfende | Zwei Schilde mit verschiedenen Laufzeiten wären schwer lesbar und schwer zu bauen; eine Obergrenze verhindert Stapeln | Skilltree 3.5; Klassen 4.3 Paladin, 6 |
| 6 | Wächterschwur im Koop | Abwehren = Spott wie Bollwerk (0,75) | weniger Bedrohung als Paladin (z. B. 0,5) | **Spott mit 0,6** (`GUARD_OATH_SHARE`), Paladin-Bedrohung ×2 bleibt | Jeder Held kann aushelfen (Gruppen ohne Paladin), der Paladin bleibt der bessere Tank. 0,6 hält noch mehr als alle anderen zusammen (1,5-fach) | Skilltree 3.5, 6; Klassen 4.3 Paladin, 8 |
| 7 | Mehrere Spötter | „wer zuletzt abwehrt, zieht“ | Duellhaltung als weiterer Spott | **Nach Anteil aufsteigend verrechnen**, höchster Anteil gewinnt (Bollwerk, Schildwall, Duellhaltung 0,75 vor Wächterschwur 0,6), bei Gleichstand wer zuletzt handelt | Der Code verrechnet Spötter nacheinander (`coopCombat.ts:1548`), der letzte gewinnt. Sortieren nach Anteil macht das Ergebnis vorhersagbar | Skilltree 3.5, 6; Klassen 4.3 Duellant |
| 8 | Signatur und Mana-/Fähigkeits-Knoten | Echo, Nachhall (neu 8 % kein Mana), Blutmagie, Eröffnung, Deckung wirken auf „Fähigkeiten“ | sollen nicht für die Signatur gelten | **Regel:** Knoten und Effekte, die von *Fähigkeit*, Mana oder Abklingzeit sprechen, gelten nicht; die von *Treffer*, *Krit* oder *Aktion* sprechen, gelten. Vollständige Liste im Skilltree 5.1 | Die Signatur kostet kein Mana und hat keine Abklingzeit; Echo würde sie verdoppeln. Eine Faustregel ist leichter zu merken als eine Liste | Skilltree 5.1 (neu); Klassen 4.1, 8 |
| 9 | Konzentration | „Runde ohne Fähigkeit“: +2 Mana pro Rang | – | Signatur-Runde zählt **nicht** als Runde ohne Fähigkeit | Der Knoten belohnt Angriff und Abwehren; sonst gäbe die Signatur zusätzlich Mana | Skilltree 5.1; Klassen 4.1 |
| 10 | Mehrfachtreffer-Knoten | Wirbelnde Klingen, Klingentanz, Tausend Schnitte für Fähigkeiten mit ≥ 2 Treffern | Berserker „Entfesseln“ (3–4 Hiebe), Pfeilhagel des Waldläufers | Gelten **nicht** für Signaturen (Fähigkeits-Regel #8), weiter für Waffen-Fähigkeiten wie Pfeilhagel | Entfesseln ist schon über Budget gerechnet; doppelte Verstärkung würde den Berserker mit Klinge zur Pflicht machen | Skilltree 5.1; Klassen 4.3 Berserker |
| 11 | Zorn des Bollwerks | Abwehr, Block, Parade | Duellhaltung (Duellant) | Duellhaltung **zählt wie eine Parade** | Gleiche Mechanik (Minderung + Konter); gibt dem Duellanten einen sinnvollen Wehr-Weg | Skilltree 3.2; Klassen 4.3 Duellant |
| 12 | Kryomant und Leisten-Auslöser | Betäubungen zählen als Einfrieren | Magier: +1 bei Einfrieren, Wächter: +1 bei Betäubung | **Ein Ereignis löst höchstens einen Auslöser aus**; Bergbrecher zählt für Kryomant als Einfrieren | Keine Doppelzählung über Umwege | Skilltree 5.1; Klassen 4.1 |
| 13 | Leisten-Knoten | – | Idee: pro Pfad ein Knoten | **4 Knoten** (Jagdfieber/Klinge: Krit, Sammlung/Wehr: Abwehren, Resonanz/Arkan: Waffen-Fähigkeit, Zersetzung/Plage: DoT-Tick), je Stufe 4 Spalte 1, 1 Rang, +1 Ladung höchstens alle 2 Runden, **nie derselbe Auslöser wie die Klasse**, ohne Klasse wirkungslos. Erst nach dem Klassen-Kern | Richtet den Baum auf Modell C aus. Die Sperre gegen doppelte Auslöser verhindert Pflichtpaare (Assassine+Klinge, Magier+Arkan, Hexer+Plage) und belohnt ungewöhnliche Kombinationen | Skilltree 3.6 (neu), 5, 6, 8 (Etappe 6); Klassen 4.1, 8, 9 |
| 14 | Deckung und halbes Bollwerk | Untergrenze 5 Mana **[K]** | Paladin: Bollwerk halbe Kosten bleibt | Bleibt beides, Paladin + Deckung 2 zahlt 5 Mana | Ein Bollwerk für 5 Mana ist ein Tank-Knopf, kein Exploit (blockt nur, kein Schaden) | Skilltree 3.2 |
| 15 | Blutmagie und LP-Kosten | Blutmagie: 2 LP pro fehlendem Mana, nicht unter 25 % | Entfesseln kostet 10 % der aktuellen LP | Getrennt: Entfesseln ist keine Blutmagie; keine Klassen-Ausnahme für Blutmagie | Unterschiedliche Regeln, unterschiedliche Grenzen; beide im Log klar trennbar | Skilltree 3.5; Klassen 4.3 Berserker |
| 16 | Namen | Knoten Klingentanz, Fels; Schild-Fähigkeit Bollwerk; Grossaxt Raserei; Turm-Segen; Wächterschwur | Passive Klingentanz, Fels, Bollwerk, Raserei, Segen; Signatur „Heiliger Schwur“; Turm-Segen „Entschlossenheit“ = Paladin-Leiste | Klassen-Namen geändert: **Fechtkunst, Bergwacht, Schildeid, Blutzorn, Frömmigkeit**, Paladin-Signatur **Richtspruch**, Turm-Segen **Kampfbereit** | Jeder Name genau einmal im Spiel; der Skilltree behält seine Namen, weil er zuerst ausgeliefert wird | Klassen 4.3, 5.3, 5.5, 5.7, 8 |
| 17 | Schild-Ereignis | `shieldGained` | `shieldGranted` | **`shieldGained`** mit optionalem `by` (fremder Schild) | ein Ereignis, eine Darstellung in Szene und Log | Skilltree 3.5; Klassen 6 |
| 18 | Spielstand-Version | v23 → v24, `character.skills = {}`, Hinweis-Feld | v24 für optionale Zähler | **v24 = Skilltree**, Klassen-Kern ohne Version, optionale Klassen-Teile **v25** | Der Skilltree kommt zuerst; zwei Schritte mit eigener Nummer und eigenem Test | Skilltree 7.2; Klassen Kurzfazit, 7 |
| 19 | Koop-Server | `validateSkills` in `sanitizeSkills`, Server rechnet Blutmagie | neue Aktion `signature`, Server prüft die Leiste, Protokollversion | Beides; **Protokollversion schon in G1** einführen, jede spätere Etappe mit Server-Änderung erhöht sie einmal. Der Server rechnet Ladungen und Leisten-Knoten selbst (`chargeGain`) | Alte Clients kennen neue Ereignisse (`bloodMagic`, `shieldGained`, `charge`, `signature`) nicht; eine Version mit „Bitte neu laden“ schützt beide Projekte | Skilltree 6; Klassen 9 |
| 20 | Golden Master | Abweichungen nur bei Kämpfen mit Skills | Etappe 1 und Kern ändern Klassenkämpfe | **Jede Snapshot-Erneuerung gehört genau einer Etappe**, nie Skilltree und Klassen zusammen | Nur so lässt sich prüfen, dass jede Abweichung erklärt ist | Skilltree 8; Klassen 9 |
| 21 | Simulations-Zielwerte | voller Baum: 80–98 % gegen Gebietsbosse | Klassen 40–60 % (Review-Simulation) | Klassen-Ziele gelten **ohne Skillpunkte**; ein zweiter Durchgang mit „Meisterpfad 13 + Zweitpfad 17“ prüft nur auf Ausreisser | Die beiden Zahlen messen Verschiedenes; ohne Klarstellung sähe es wie ein Widerspruch aus | Skilltree 9; Klassen 9 |
| 22 | Hexer und Gift-Knoten | Vergiftete Waffen, Giftmischer, Fäulnis | Hexer-DoT-Bonus +50 % → +25 %, „Wandelbare Flüche“ | Wandelbare Flüche gilt für **jedes eigene Gift**, auch aus Vergiftete Waffen; alles in Klassen-Etappe 5 mitsimulieren | Konsistente Regel; Plage bleibt für den Hexer gut, aber nicht mehr übermächtig | Klassen 8 |
| 23 | Reihenfolge `combatCore.ts` | Skilltree in einem Zweig, eine Veröffentlichung | Skilltree zuerst mergen | **Sofortkorrekturen → Skilltree → Klassen-Kern**, Klassen in eigenen Funktionen (`chargeGain`, `signatureStrike`) | Der Skilltree ist fertig ausgearbeitet und klassenunabhängig; der Kern baut auf `afterHeroHit`/`heroVolley` in der neuen Form auf | Skilltree 8; Klassen 8, 9 |

---

## 2. Gemeinsamer Etappenplan

Reihenfolge innerhalb jeder Etappe wie in der Projektregel: Domain + Tests → Store (Migration) →
Koop/Server → Szene und Ereignisse → UI → Doku. Nach jeder Etappe `npx vitest run`, `npx tsc -b`,
`npm run functions:build` (Deploy nur auf ausdrücklichen Wunsch).

| Etappe | Inhalt | Herkunft | Aufwand | Spielstand | Golden Master |
|---|---|---|---|---|---|
| **G0 Messbar machen** ✅ | Simulation als Test: Klassenspreizung (Review Nr. 22) als Leitplanken-Test `src/domain/classBalance.test.ts`, Budget-Messung (D pro Runde, Vergleich ohne Klasse), Skilltree- und Koop-Simulation; alles in der Hilfsdatei `src/test/classSim.ts`, Berichte in `src/domain/zzClassSim.test.ts` (`SIM_MODE`) | Klassen E0, Skilltree 9 | M (1 Tag) | – | – |
| **G1 Sofortkorrekturen** ✅ | Krit-Gesamtobergrenze 60 %, Schild 2,2, Heiliger Hammer (Wucht oder Magie, 1,5), Kleriker-`groupHeal` im Koop, **Protokollversion** 1 in `protocol.ts`, veraltete Kommentare | Klassen E1 | S (½ Tag) | – | einmal erneuert (19 Kämpfe, alle mit Schild, Streitkolben, Kleriker oder hoher Krit-Chance) |
| **G2 Skilltree-Release** | Skilltree-Etappen 1–4: Struktur (12 Punkte, Meisterschafts-Gabel, `validateSkills`, Migration **v24** mit Rückerstattung und Toast), Werte und Umbauten, neue Knoten, zweite Meisterschaften inkl. Wächterschwur 0,6, Schild-Topf `ward` und Tausend Schnitte mit gemeinsamem Koop-Stapel | Skilltree 8 | 4,5–6,5 Tage | **v24** | pro Skilltree-Etappe, nur Kämpfe mit Skills |
| **G3 Klassen-Kern** | Klassen-Etappen 2–5: `ClassKit`, Leiste, 11 Signaturen (zwei Wellen), neue Passive, **Paladin mit Schwert** (Erkennung, Geweihte Klinge); Koop mit Aktion `signature`, Gruppenwirkungen, Spott-Reihenfolge, **Boss-Raserei ab Runde 20**; Darstellung samt **Quest „Finde deine Klasse“**; Abstimmen mit Simulation und Playtest | Klassen 9 | 8,5–11,5 Tage + Spielzeit | – | pro Welle, nur Kämpfe mit Klasse; Raserei getrennt (nur Koop-Kämpfe über Runde 20) |
| **G4 Verzahnen und Ausbau** | Leisten-Knoten (Skilltree-Etappe 6), Brückenknoten (Skilltree-Etappe 5), danach optional Klassen-Etappe 6 (Klassen-Item-Effekte, Signatur- und Meisterschafts-Erfolge und Klassenränge mit **v25**, Rüstung umschmieden, Turm-Segen, **Druide nach dem Playtest des Klerikers**) | Skilltree 8, Klassen 9 | je ½–2 Tage | **v25** (nur optional) | pro Teil |

**Boss-Raserei im Koop (G3, Klassen-Etappe 3):** ab Runde 20 +10 % Schaden des Gegners pro Runde (additiv),
heroische Endbosse ab Runde 30, angekündigt ab Runde 17, nur Koop, nicht auf Begleiter. Gerechnet aus
`state.round` auf dem Server, kein neues Feld. Begründung und Simulation: docs/klassen-neukonzept.md 4.5.
Sie kommt in G3, weil erst Gebet, Richtspruch-Schild, Wächterschwur und Lebensband die Kämpfe verlängern;
heute erreicht kaum eine Gruppe Runde 20.

**Quest „Finde deine Klasse“ (G3, Klassen-Etappe 4):** Story-Quest ab Lv. 5, Sieg mit aktiver Klasse, Belohnung
Gold und ein seltenes Rüstungsteil passend zur Hauptwaffe (docs/klassen-neukonzept.md 4.7). In G3 statt G4,
weil der Abstand für klassenlose Helden mit Leiste und Signatur erst sichtbar wird.

**Auslieferung (entschieden 2026-11-12: G2 und G3 zusammen):** G1 sofort und allein. G2 und G3 **zusammen ausliefern**, wenn G3 innerhalb von
etwa zwei Wochen nach G2 fertig ist: Dann gibt es eine einzige Rückerstattung der Skillpunkte (v24), eine
Protokollerhöhung und eine Ankündigung („Klassen und Talente“). Spieler verteilen ihre Punkte nur einmal,
und zwar schon mit Blick auf die neuen Klassen. Dauert G3 länger, G2 allein ausliefern; dann braucht es mit
G3 ein **kostenloses Zurücksetzen** der Skillpunkte, weil sich die Klassen stark ändern. Der Hinweis auf die
Rückerstattung ist ein **Toast** (kein Dialog), bei gemeinsamer Auslieferung ein Text für Klassen und Skilltree.

**Risiken des gemeinsamen Plans**

- `combatCore.ts` wird in G1, G2 und G3 geändert. Gegenmittel: strikte Reihenfolge, Klassen-Logik in eigenen
  Funktionen, Golden Master pro Etappe.
- Die Skilltree-Simulation in G2 läuft noch mit den alten Klassen; die Zahlen verschieben sich in G3 erneut.
  Deshalb in G3 Etappe 5 beide Simulationen (ohne Skills, voller Baum) gemeinsam neu laufen lassen.
- Koop-Kämpfe, die über ein Release hinweg laufen: neue Felder (`charge`, `ward`, `absorbedSinceVerdict`)
  immer optional lesen.

---

## 3. Entscheidungen des Entwicklers

Alle Fragen sind entschieden (2026-11-12). Die drei Abweichungen von den Empfehlungen (fett) sind in die
Konzepte eingearbeitet.

| # | Frage | Entscheidung | Eingearbeitet in |
|---|---|---|---|
| – | Modell | C „Klassen mit Kern“ | beide Konzepte |
| – | Lebensband oder Gnade | Lebensband | Skilltree 3.5, Klassen 4.3 |
| – | Reihenfolge | Sofortkorrekturen → Skilltree → Klassen-Kern | Abschnitt 2 |
| 1 | Auslieferung | G2 und G3 zusammen, eine Rückerstattung (v24), eine Protokollerhöhung | Abschnitt 2 |
| – | Leisten-Knoten | vier Knoten, 1 Rang, höchstens alle 2 Runden | Skilltree 3.6 |
| 2 | Hinweis nach der Rückerstattung | Toast, kein Dialog | Skilltree 7.2, Abschnitt 2 |
| 3 | Handy | Leiste und Signatur-Knopf passen in die Aktionsleiste | Klassen 6 |
| 4 | **Paladin mit Schwert + Schild** | **ja**; Erkennung über Schild + (Streitkolben oder Schwert), „Geweihte Klinge“ (Schwert skaliert beim Paladin mit Ausdauer), Abgrenzung zum Duellanten über Rüstung, Attribut, Rolle und Leiste; Signatur und Passiv unverändert, Parade zählt als Abwehren | Klassen 4.3, 4.7, Etappe 2 (G3) |
| 5 | Signatur gegen Boss-Mechaniken | immer sicher (kein Zurückwerfen, kein Verschlingen) | Klassen 4.1, Skilltree 5.1 |
| 6 | Klassenlose Helden | keine Grund-Signatur; Quest „Finde deine Klasse“ in G3 | Klassen 4.7, Etappe 4 (G3) |
| 7 | Ausdauer-Waffen | bleiben bei 0,15 | Klassen 4.3 |
| 8 | Druide | in G4, Entscheidung nach dem Playtest des Klerikers | Klassen 4.6, Etappe 6 (G4) |
| 9 | **Tausend Schnitte im Koop** | **ein gemeinsamer Bluten-Stapel pro Gegner**, Deckel 5 für alle zusammen; Bedrohung nach Stapeln (`stacksBy`), `sourceId` = letzter Stapel (Blutsturz), Server rechnet in `resolveRound` | Skilltree 3.5, 6 (G2) |
| 10 | Brücken | höchstens eine | Skilltree 2, 4 |
| 12 | **Kampfdauer im Koop** | **rundenbasierte Boss-Raserei: ab Runde 20 +10 % Schaden pro Runde** (heroisch ab 30), angekündigt ab Runde 17, nur Koop, nicht auf Begleiter | Klassen 4.5, Etappe 3 (G3) |
| 13 | Erfolge | Meisterschafts- und Signatur-Erfolge zusammen mit v25 | Klassen 5.7, Skilltree 10 (G4) |
| 14 | Rangliste nach Klasse | nein | Klassen 5.6 |
