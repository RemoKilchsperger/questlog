# Überfälle aufs Dorf

Ab und zu kündigt sich eine Bande an und will das Dorf überfallen (Idee #47 in `ideen.md`). Bis zur Frist kann man
sich ihr stellen. Wer verliert oder die Frist verpasst, bekommt ein beschädigtes Gebäude. Die neue **Wehranlage**
schwächt die Angreifer.
Code: `src/domain/raids.ts`, Store `gameStore.ts` (`raids`, `raid`), Oberfläche `src/components/RaidPanel.tsx`.

Status: **umgesetzt** (Spiellogik, Spielstand v22, Oberfläche). Kein Backend betroffen, kein `functions:deploy` nötig.

## Entschiedene Regeln

| Thema | Entscheidung |
|---|---|
| Ablauf | Wellen und ein Anführer, wie ein kurzer Dungeon ohne Gabelungen. LP werden mitgenommen |
| Auslöser | Nach Zeit: Die Bande kündigt sich an und greift nach einer Frist an |
| Folgen | Ein Gebäude wird beschädigt und wirkt eine Stufe tiefer, bis man es repariert. Stufen gehen nie verloren |
| Verteidigung | Neues Gebäude Wehranlage. Begleiter im Dorf stehen Wache |

## Ablauf

1. Ab **3 gebauten Gebäuden** kündigt sich die erste Bande sofort an, danach jeweils **24–48 Stunden** nach dem Ende
   des letzten Überfalls. Angekündigt wird nur, wenn das Spiel offen ist. Wer lange weg war, verpasst also höchstens
   einen Angriff.
2. Die Bande kommt aus dem Gebiet, zu dem das Level des Helden gehört (Goblin-Bande, Sumpfbrut, Höhlenbrut, Frostrudel,
   Untote Horde, Drachenbrut). Alle Gegner kämpfen auf dem Level des Helden bei der Ankündigung.
3. Sie greift nach **12 Stunden** an. Bis dahin: „🛡️ Dorf verteidigen“ im Dorf oder im Menü der Wehranlage.
4. **3 Wellen** (ab Wachturm 2) mit zufälligen Kreaturen des Gebiets, am Ende der **Anführer**: der stärkste gewöhnliche
   Gegner des Gebiets, immer Elite mit zwei Modifikatoren, Stärke ×1,1. Gegner und Elite stehen per Startwert fest.
5. Das Gericht aus der Taverne wirkt bei allen Wellen.

| Ausgang | Folge |
|---|---|
| Anführer besiegt | Truhe mit der Beute aller Kämpfe und der Beute der Bande: Gold und EP wie 10 Siege, 5 Material des Gebiets, sicher ein Item mit Boss-Chancen. Zählt für den Erfolg „Verteidiger“ |
| Verloren | Ein zufälliges Gebäude ab Stufe 2 (nicht die Wehranlage, nicht schon beschädigt) wird beschädigt. Gibt es keines, plündert die Bande das Lager: 10 % Gold, 20 % jedes Materials. Die Truhe ist weg |
| Frist verpasst | Wie verloren |
| Festung (Wehranlage 3) | Verloren oder verpasst: Die Wachen halten die Bande auf, nichts wird beschädigt, aber es gibt keine Beute |
| Geflohen | Kein Verlieren: Die Bande wartet weiter bis zur Frist, man kann es noch einmal versuchen. Die Truhe ist weg |

Läuft die Frist ab, während man gerade gegen die Bande kämpft, darf man zu Ende kämpfen.

## Beschädigte Gebäude

- Ein beschädigtes Gebäude wirkt eine Stufe tiefer (`effectiveVillage`, im Store `activeVillage`). Weil nur Gebäude ab
  Stufe 2 beschädigt werden, schliesst nie eines ganz.
- **Reparieren** kostet 25 % der Gold- und Materialkosten seiner Stufe (aufgerundet), z. B. Schmiede Stufe 2:
  250 Gold, 7 Hartholz, 3 Lehm. Wer das Gebäude ausbaut, repariert es gleich mit.
- Im Dorfbild brennt über beschädigten Gebäuden ein 🔥, die Karte zeigt die Reparatur.

## Wehranlage

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 0 | – | Überfälle mit voller Stärke | – |
| 1 | Palisade | Angreifer 10 % schwächer | 150 G, 15 🪵, 10 🧱 |
| 2 | Wachturm | 15 % schwächer, eine Welle weniger | 1'000 G, 25 🌲, 10 💎 |
| 3 | Festung | 20 % schwächer, eine Welle weniger, kein Gebäude wird mehr beschädigt | 5'000 G, 30 🌑, 15 🌲 |

„Schwächer“ heisst weniger Lebenspunkte und Schaden (Faktor `power`, wie im Turm). Jeder Begleiter, der nicht auf Mission
ist, schwächt um weitere 4 %, höchstens 3 Begleiter. Die Wehranlage steht als Turm hinten auf dem Hügel, zwischen Statue
und Anschlagtafel. Mit ihr hat das Dorf 8 Gebäude, „Dorfgründer“ und „Baumeister“ brauchen sie auch.

## Balance

Grundstärke der Angreifer 0,9 (etwas schwächer als eine Kreatur gleichen Levels, denn um einen Überfall kommt man nicht
herum). Simulation in `combat.test.ts` mit einem gut gespielten Champion, 60 Überfälle pro Fall:

| Ohne Wehranlage | Lv. 8 | Lv. 25 | Lv. 45 | Lv. 58 |
|---|---|---|---|---|
| Selten, mit Heiltränken | ~93 % | ~100 % | ~100 % | ~92 % |
| Gewöhnlich, mit Heiltränken | ~63 % | ~87 % | ~100 % | ~75 % |
| Gewöhnlich, ohne Tränke | 0 % | 0 % | 0 % | 0 % |

Mit Festung schafft man es gewöhnlich ausgerüstet mit Tränken fast immer.

## Oberfläche

- Dorf-Tab: rotes „!“, solange eine Bande anrückt. Im Dorfbild ⚔️ oben links (springt zur Ankündigung).
- Unter dem Dorfbild die Ankündigung: Bande, Frist, Wellen und Anführer, was die Angreifer schwächt, Knopf zum Verteidigen.
  Danach der Bericht des letzten Überfalls, bis man ihn wegklickt (nach einem Kampf hat man ihn schon gesehen).
- Im Kampf: „⚔️ Überfall · Kampf 2/4“, darunter wann der Anführer kommt und was in der Truhe liegt.
- Menü der Wehranlage: Erklärung, Ankündigung bzw. „Ruhig“.

## Später möglich

- Banden mit eigenem Boss als Anführer (z. B. Krummzahn selbst greift an)
- Verteidigung im Koop: Ein Freund hilft beim Überfall
- Begleiter kämpfen mit (Idee #38)
