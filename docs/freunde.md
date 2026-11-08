# Freundesliste

Spieler fügen sich per Benutzername als Freunde hinzu. Wartet ein Freund in einer Koop-Lobby, sieht
man das live und kann direkt beitreten, ohne Code. Kein Chat (bewusst: keine Moderation nötig).
Code: `src/friends/` (Datenbank, Presence, Store), `src/components/FriendsScreen.tsx`,
`supabase/migrations/20261108120000_friendships.sql`, Befehl `joinFriend` in `src/coop/`.

Status: fertig auf Branch `feature/freundesliste`. Noch nicht online ausprobiert: Migration und
Edge Function `coop` müssen erst eingespielt werden (siehe Deploy).

## Ablauf

1. Im Tab **„👥 Freunde“** (`#/freunde`) einen Benutzernamen eingeben oder im Profil eines Helden
   auf „Als Freund hinzufügen“ klicken.
2. Der andere sieht die Anfrage (Abzeichen am Tab) und nimmt an oder lehnt ab. Haben beide
   gleichzeitig gefragt, wird die zweite Anfrage direkt zur Freundschaft.
3. In der Liste steht bei jedem Freund entweder **„In der Lobby: Sumpfhydra · ab Lv. 30 · 2/4“**
   mit „Beitreten“ oder **„zuletzt aktiv vor 5 Min.“**.
4. „Beitreten“ geht, wenn das eigene Level für den Inhalt reicht, die Lobby nicht voll ist und man
   nicht schon in einer Koop-Lobby sitzt. Alle Freunde dürfen beitreten, eine Einladung braucht es nicht.

## Online-Status: nur mit offener Lobby

Live ist nur, wer in einer Koop-Lobby wartet, und zwar über Supabase Realtime Presence auf dem Kanal
`coop-lobbies` (`lobbyPresence.ts`). Wer in einer Lobby sitzt, ist ohnehin schon per Realtime verbunden
(Abo der Lobby-Zeile). Presence läuft über dieselbe WebSocket-Verbindung und kostet keine zusätzliche.
Die Freundesliste verbindet sich nur, solange sie offen ist.

Alle anderen zeigen „zuletzt aktiv“ aus `public_profiles.updated_at`, dem letzten Cloud-Sync des
Spielstands. Es braucht keine Verbindung.

So bleibt das Limit für gleichzeitige Realtime-Verbindungen im Gratis-Tarif (200) weit weg, und Koop
und Tausch werden nicht von Spielern blockiert, die nur die App offen haben.

## Sicherheit

- **Tabelle `friendships`:** jedes Paar genau einmal (`user_a < user_b`). RLS: lesen nur die Beteiligten,
  Anfrage nur im eigenen Namen (höchstens 50 offene), annehmen nur der Gefragte und nur die Spalte
  `status` (Spalten-Grant), löschen beide.
- **Presence enthält keinen Lobby-Code**, nur Spieler-Id, Inhalt und Anzahl. Den Kanal kann jeder
  angemeldete Client abhören und auch Falsches melden. Das betrifft nur die Anzeige.
- **Beitreten** läuft über den Koop-Befehl `joinFriend`. Die Edge Function prüft die Freundschaft in
  `friendships` und sucht die offene Lobby des Freundes (`phase = 'lobby'`). Ohne Freundschaft verrät
  der Server nicht, ob es eine Lobby gibt.
- **Level:** Beitreten kann nur, wessen Level für den Inhalt reicht – über die Freundesliste genauso wie
  per Code oder Link (`join` in `server.ts`). Wer schon in der Lobby ist, kommt immer zurück.

## Bewusst weggelassen

- Chat, Blockieren und Melden – ohne freien Text gibt es nichts zu moderieren.
- Live-Status für Spieler ohne Lobby, Push-Benachrichtigungen bei neuen Anfragen.
- Freunde im lokalen Testmodus: Die Liste braucht ein Cloud-Konto. `joinFriend` funktioniert lokal
  trotzdem (sucht die Lobby über `player_ids`), es gibt nur keine Liste, die ihn auslöst.

## Deploy

1. Migration `20261108120000_friendships.sql` im SQL Editor ausführen (oder `supabase db push`).
2. `npm run functions:deploy` – die Edge Function `coop` kennt jetzt `joinFriend`.
