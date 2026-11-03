# Item-Tausch

Zwei Spieler tauschen Items direkt miteinander – statt eines offenen Marktplatzes, der sich mit
dem heutigen Spielstand (der Browser rechnet, die Cloud speichert nur) kaum gegen Betrug schützen
lässt. Code: `src/domain/trade.ts` (Regeln), Server und Oberfläche folgen.

Status: **Etappe 1 fertig** auf Branch `feature/item-tausch` (Domain-Logik mit Tests).

## Ablauf

1. Spieler A öffnet „Tauschen“ und bekommt einen Code (6 Zeichen, wie beim Koop).
2. Spieler B gibt den Code ein. Beide sehen „Du gibst“ und „Du bekommst“.
3. Jeder legt bis zu **6 Items** aus seinem Inventar hinein, der andere sieht sie mit Tooltip.
4. Beide klicken **„Bereit“**. Ändert danach jemand sein Angebot, sind beide wieder nicht bereit.
5. Beide klicken **„Tauschen“**. Der Server prüft und schliesst den Tausch ab, beide Clients führen ihn aus.

## Regeln

- **Handelbar:** alle normalen Items jeder Seltenheit, auch Beute aus Quests und Aufträgen, auch
  verbesserte (die Stufe wandert mit).
- **Nicht handelbar:** Boss-Items (`tradeBlockReason`). Angelegte Items liegen nicht im Inventar
  und können erst nach dem Ablegen angeboten werden.
- **Kein Gold** im Tausch – Gold lässt sich am leichtesten ercheaten und am schwersten prüfen.
- Ab **Level 10** (`TRADE_MIN_LEVEL`), nur mit Online-Konto.
- Höchstens **5 Tausche pro Tag** (`TRADE_DAILY_LIMIT`, prüft der Server) gegen Nebenkonten.

## Prüfung eines Items (`validateTradeItem`)

Ein Item aus fremden Daten muss so aussehen, wie es als Drop entstanden sein könnte:

- `itemId` existiert und ist kein Boss-Item, `rarity` ist bekannt
- genau `bonusCount` verschiedene Attribute, jedes mit genau `bonusValue(Seltenheit, Item-Level)`
- `upgrade` ganzzahlig zwischen 0 und `MAX_UPGRADE`
- `effect` gleich `rollItemEffect(uid)` (nur legendäre), `abilities` gleich `rollWeaponAbilities(uid)`
  (nur Waffen) – fehlen sie (alte Stände), werden sie ergänzt

Ein erfundenes Item, das es so geben *könnte*, kommt durch. Ganz verhindern liesse sich das nur,
wenn der Server auch die Beute würfelt. Für einen Tausch, dem beide zustimmen, ist das vertretbar.

## Technik (Etappe 2 bis 4)

Der Spielstand gehört dem Browser: Schreibt der Server hinein, überschreibt der nächste Upload
die Änderung. Darum zwei Schritte:

1. **Server entscheidet.** Edge Function `trade` (Befehle `create`, `join`, `setOffer`, `ready`,
   `confirm`, `cancel`) nach dem Muster von `coop`. Beim letzten `confirm` in einer Transaktion:
   Angebote gegen die **Cloud-Spielstände** prüfen (`checkOffer`), Besitzer in `item_owners`
   eintragen, `status = 'done'`. `where version = …` verhindert doppelte Bestätigungen.
2. **Clients führen aus.** Jeder Client sieht „done“, wendet `applyTrade` an und merkt sich die
   Tausch-Id im Spielstand (`appliedTrades`), damit nichts doppelt passiert.

### Tabellen

- `trades`: id, code, player_ids (RLS: nur die zwei lesen), offers, ready, confirmed, status
  (`open` / `done` / `cancelled`), version, updated_at. Realtime für die Live-Ansicht.
- `item_owners`: uid → owner_id, trade_id. Wird bei jedem Tausch aktualisiert, auch beim
  Zurücktauschen.

### Schutz gegen das Zurückspielen

Ein Trigger auf `saves` (`before insert or update`) lehnt jeden Spielstand ab, der in Inventar
oder Ausrüstung eine uid enthält, die laut `item_owners` jemand anderem gehört. Sonst könnte man
nach dem Tausch einen alten Cloud-Stand wiederherstellen und das Item doppelt haben.

Wer offline geht, bevor sein Client den Tausch ausgeführt hat, wird beim nächsten Upload
abgelehnt. Der Abgleich in `cloudStore.ts` holt dann die abgeschlossenen Tausche, die noch nicht
in `appliedTrades` stehen, führt sie aus und lädt erneut hoch.

### Lokal testen

Wie beim Koop ein Backend `local`: dieselbe Server-Logik im Browser, zwei Tabs über
BroadcastChannel.

## Etappen

1. ✅ Domain: `trade.ts` – handelbar, Prüfung, Angebot, Ausführen (`trade.test.ts`)
2. Server: Migration (`trades`, `item_owners`, Trigger), Edge Function, lokales Backend
3. Oberfläche: Tauschfenster, Code, Bereit/Tauschen, Hilfe-Seite
4. Abgleich: offene Tausche beim Login und nach abgelehntem Upload ausführen
