# Waffen skalieren mit Attributen – Plan

Bisher gab Stärke jedem Helden Schaden, egal mit welcher Waffe. Neu skaliert jede Waffe mit
ihrem eigenen Attribut. So wird jedes Attribut für bestimmte Builds wichtig – auch Charisma.

Status: **umgesetzt.** Edge Function muss neu deployt werden (Koop rechnet die Kampfwerte auf dem Server).

---

## 1. Entschiedene Spielregeln

| Attribut | Waffen | Ausserdem |
|---|---|---|
| Stärke | Schwert, Zweihandschwert, Axt, Grossaxt, Grosshammer | – |
| Intelligenz | Stab, Zepter | Mana |
| Ausdauer | Streitkolben, Schild (Angriff **und** Rüstung des Schilds) | Lebenspunkte |
| Charisma | Dolch, Bogen | **Kritische Trefferchance** (bisher Intelligenz), Gold nach Kämpfen |

- **Attributpunkte zurücksetzen:** Das erste Mal kostenlos, danach teuer
  (`50 · Level · (1 + Level / 10)` Gold – doppelt so viel wie die Skillpunkte).
  Alle Attribute fallen auf 1 zurück, alle Punkte darüber werden frei – auch die aus epischen Quests
  (welcher Punkt woher kam, lässt sich nicht sicher sagen, weil Quests gelöscht werden können).

## 2. Formel

- **Schaden aus Attributen:** wie bisher `0,25 · Attribut`, aber das Attribut der Waffe. Bei zwei
  Waffen zählt jede nach ihrem Anteil am Angriff – mit lauter Stärke-Waffen ergibt das genau die
  alte Formel.
- **Schild-Rüstung:** zusätzlich `0,1 · Ausdauer` Rüstung pro angelegtem Schild.
- **Kritisch:** `5 % + 0,2 % · Charisma` (max. 30 %).
- Per Simulation abgestimmt (8 Builds, Punkte und Item-Boni passend zum Build verteilt):
  - **Ausdauer gibt nur 0,15 Schaden pro Punkt**, weil sie zugleich Lebenspunkte bringt – mit 0,25
    waren Paladin und Kleriker allen anderen klar überlegen.
  - **Schild-Rüstung: 0,1 pro Ausdauer-Punkt** (statt 0,25).
  - **Paladin: +20 % statt +40 % Schaden** – der Bonus stammte aus der Zeit, als er seine Punkte auf
    Stärke und Ausdauer aufteilen musste.
- Ergebnis: Vorher kamen nur Stärke-Builds durch die Dungeons (Kleriker und Waldläufer 0 %), jetzt liegen
  die meisten Builds nah beieinander. Hexer und Assassine bleiben schwach – das lag schon vorher an
  Zepter und Dolch selbst, nicht an den Attributen.

## 3. Anzeige

- Item-Tooltip und Inventar: „skaliert mit Stärke“ bei Waffen.
- Charakter-Tab: bei jedem Attribut, was es bewirkt und welche Waffen davon profitieren; Knopf zum
  Zurücksetzen mit Kosten.
- Hilfeseite, README und Kampf-Tab-Texte anpassen.

## 4. Technik

| Teil | Änderung |
|---|---|
| `domain/weaponScaling.ts` (neu) | Zuordnung Waffe → Attribut, Schadens- und Schild-Rüstungsbonus |
| `domain/combat.ts` | Profil: neue Schadensformel, Krit aus Charisma |
| `domain/leveling.ts` | Zurücksetzen der Attributpunkte, Kosten |
| `types.ts` | `Character.attributeResets` (Anzahl bisheriger Zurücksetzungen) |
| Koop | Kampfwerte rechnet der Server aus dem Spielstand – Edge Function neu deployen |
