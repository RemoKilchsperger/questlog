# Item-Tausch

Zwei Spieler tauschen Items direkt miteinander – statt eines offenen Marktplatzes, der sich mit
dem heutigen Spielstand (der Browser rechnet, die Cloud speichert nur) kaum gegen Betrug schützen
lässt. Code: `src/domain/trade.ts` (Regeln), `src/trade/` (Server-Logik, Protokoll, Backend),
`supabase/functions/trade` (Edge Function), `supabase/migrations/20261103120000_trades.sql`.

Status: **Etappe 1 und 2 fertig** auf Branch `feature/item-tausch` (Domain, Server, Datenbank). Oberfläche folgt.

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
- Höchstens **5 abgeschlossene Tausche in 24 Stunden** (`TRADE_DAILY_LIMIT`, prüft der Server bei
  Eröffnen, Beitreten und Abschluss) gegen Nebenkonten.
- Nur **ein offener Tausch** pro Spieler. Ein Tausch braucht mindestens ein Item, ein Geschenk geht.

## Prüfung eines Items (`validateTradeItem`)

Ein Item aus fremden Daten muss so aussehen, wie es als Drop entstanden sein könnte:

- `itemId` existiert und ist kein Boss-Item, `rarity` ist bekannt
- genau `bonusCount` verschiedene Attribute, jedes mit genau `bonusValue(Seltenheit, Item-Level)`
- `upgrade` ganzzahlig zwischen 0 und `MAX_UPGRADE`
- `effect` gleich `rollItemEffect(uid)` (nur legendäre), `abilities` gleich `rollWeaponAbilities(uid)`
  (nur Waffen) – fehlen sie (alte Stände), werden sie ergänzt

Ein erfundenes Item, das es so geben *könnte*, kommt durch. Ganz verhindern liesse sich das nur,
wenn der Server auch die Beute würfelt. Für einen Tausch, dem beide zustimmen, ist das vertretbar.

## Technik

Der Spielstand gehört dem Browser: Schreibt der Server hinein, überschreibt der nächste Upload
die Änderung. Darum zwei Schritte:

1. **Server entscheidet.** Edge Function `trade` (Befehle `create`, `join`, `setOffer`, `ready`,
   `confirm`, `cancel`) nach dem Muster von `coop`. Beim letzten `confirm` in einer Transaktion:
   Angebote gegen die **Cloud-Spielstände** prüfen (`checkOffer`), Besitzer in `item_owners`
   eintragen, `status = 'done'`. `where version = …` verhindert doppelte Bestätigungen.
2. **Clients führen aus.** Jeder Client sieht „done“, wendet `applyTrade` an und merkt sich die
   Tausch-Id im Spielstand (`appliedTrades`), damit nichts doppelt passiert.

### Tabellen

- `trades`: id, code, player_ids (RLS: nur die zwei lesen), names, offers, ready, confirmed,
  status (`open` / `done` / `cancelled`), version, updated_at, completed_at. Realtime für die
  Live-Ansicht. Offene und abgebrochene Tausche räumt der Server nach 24 Stunden weg,
  abgeschlossene bleiben – aus ihnen holt sich ein Client, was er noch ausführen muss.
- `item_owners`: uid → owner_id, from_id (wer es zuletzt hergab), trade_id. Lesen dürfen Besitzer
  und Vorbesitzer. Der Trigger `register_traded_items` auf `trades` trägt beim Abschluss die neuen
  Besitzer ein – in derselben Transaktion. Gehört ein Item laut Register schon jemand anderem
  (dasselbe Item in zwei Tauschen angeboten), scheitert der Abschluss (`QL_ITEM_TRADED`).

### Befehle (`src/trade/server.ts`)

| Befehl | Wirkung |
|---|---|
| `create` | Eröffnet mit Code. Prüft Level, offene Tausche, Tageslimit |
| `join` | Tritt per Code bei (höchstens zwei), dieselben Prüfungen |
| `offer` | Ersetzt das eigene Angebot, geprüft gegen das Inventar im Spielstand. Setzt Bereit und Bestätigt beider zurück |
| `ready` | Bereit an/aus (erst mit Partner). Aus nimmt die Bestätigungen zurück |
| `confirm` | Erst wenn beide bereit. Prüft das eigene Angebot erneut; beim zweiten Bestätigen beide Angebote und das Tageslimit, dann `done` |
| `cancel` | Bricht einen offenen Tausch ab |

### Schutz gegen das Zurückspielen

Ein Trigger auf `saves` (`before insert or update`) lehnt jeden Spielstand ab, der in Inventar
oder Ausrüstung eine uid enthält, die laut `item_owners` jemand anderem gehört. Sonst könnte man
nach dem Tausch einen alten Cloud-Stand wiederherstellen und das Item doppelt haben.

Der Trigger `reject_foreign_items` sucht alle `uid` im ganzen Spielstand (`lax $.**.uid`), also
auch angelegte Items und Begleiter-Ausrüstung. Fehler: `QL_FOREIGN_ITEM <uid>`.

Wer offline geht, bevor sein Client den Tausch ausgeführt hat, wird beim nächsten Upload
abgelehnt. Der Abgleich in `cloudStore.ts` holt dann die abgeschlossenen Tausche, die noch nicht
in `appliedTrades` stehen, führt sie aus und lädt erneut hoch. Als Rückfall entfernt er Items, die
laut `item_owners` (`from_id` = ich, `owner_id` ≠ ich) nicht mehr ihm gehören.

Geprüft mit PGlite: Abschluss trägt Besitzer ein, alter Stand mit weggetauschtem Item wird
abgelehnt, dasselbe Item in einem zweiten Tausch scheitert, Rücktausch funktioniert.

### Bekannte Lücke

Zwischen dem Bestätigen und dem Ausführen könnte ein Spieler ein angebotenes Item noch beim
Händler verkaufen (der Server prüft den Cloud-Stand, der Upload kommt verzögert). Er bekäme dann
den Verkaufspreis und der Partner das Item. Die Oberfläche sperrt Items im offenen Tausch, und
vor dem Bestätigen wird sofort hochgeladen – ganz schliessen liesse es sich nur mit Gold auf dem
Server.

### Lokal testen

Wie beim Koop ein Backend `local` (`src/trade/backend.ts`): dieselbe Server-Logik im Browser,
zwei Tabs über BroadcastChannel. Beide Tabs teilen sich den Spielstand – das reicht für den
Ablauf, nicht für den Besitzerwechsel.

### Deploy

1. Migration im SQL Editor ausführen (oder `supabase db push`).
2. `npm run functions:deploy -- --project-ref <ref>` baut und deployt `coop` und `trade`.

## Etappen

1. ✅ Domain: `trade.ts` – handelbar, Prüfung, Angebot, Ausführen (`trade.test.ts`)
2. ✅ Server: Migration (`trades`, `item_owners`, Trigger), Edge Function, lokales Backend (`src/trade/server.test.ts`)
3. Oberfläche: Tauschfenster, Code, Bereit/Tauschen, Hilfe-Seite
4. Abgleich: offene Tausche beim Login und nach abgelehntem Upload ausführen
