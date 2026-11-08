import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useCloudStore } from "../cloud/cloudStore";
import { cloudEnabled } from "../cloud/supabase";
import { useCoopStore } from "../coop/coopStore";
import { COOP_MAX_PLAYERS, coopContent } from "../domain/coopCombat";
import { getLevel } from "../domain/leveling";
import { lastSeenText, type Friend } from "../friends/friends";
import { useFriendStore } from "../friends/friendStore";
import { watchLobbies, type LobbyPresence } from "../friends/lobbyPresence";
import { useGameStore } from "../store/gameStore";
import { AvatarFrame } from "./Achievements";
import { ConfirmDialog } from "./ConfirmDialog";
import { PixelAvatar } from "./PixelAvatar";
import { useNow } from "./useNow";

/** Offene Anfragen an einen selbst – für das Abzeichen am Tab. */
export function useIncomingFriendRequests(): number {
  return useFriendStore((s) => s.friends.filter((f) => f.status === "incoming").length);
}

/** Freundesliste: Anfragen, Freunde mit offener Koop-Lobby (beitreten) und „zuletzt aktiv“. */
export function FriendsScreen({ onJoined }: { onJoined: () => void }) {
  const session = useCloudStore((s) => s.session);
  const username = useCloudStore((s) => s.username);

  if (!cloudEnabled || !session) {
    return (
      <section className="panel p-5">
        <h2 className="font-pixel text-2xl">👥 Freunde</h2>
        <p className="mt-2 text-sm text-muted">
          {cloudEnabled
            ? "☁️ Für die Freundesliste musst du mit deinem Cloud-Konto angemeldet sein (oben rechts)."
            : "Die Online-Funktionen sind noch nicht eingerichtet."}
        </p>
      </section>
    );
  }
  if (!username) {
    return (
      <section className="panel p-5">
        <h2 className="font-pixel text-2xl">👥 Freunde</h2>
        <p className="mt-2 text-sm text-muted">Wähle zuerst einen Benutzernamen – damit finden dich deine Freunde.</p>
      </section>
    );
  }
  return <FriendList myId={session.user.id} myName={username} onJoined={onJoined} />;
}

function FriendList({ myId, myName, onJoined }: { myId: string; myName: string; onJoined: () => void }) {
  const { friends, loaded, error, load } = useFriendStore();
  const [lobbies, setLobbies] = useState<ReadonlyMap<string, LobbyPresence>>(new Map());
  const now = useNow(60_000).getTime();

  useEffect(() => void load(), [load]);
  // Live nur, solange die Liste offen ist – so braucht niemand sonst eine Verbindung
  useEffect(() => watchLobbies(myId, (next) => setLobbies(new Map(next))), [myId]);

  const accepted = friends
    .filter((f) => f.status === "accepted")
    .sort((a, b) => Number(lobbies.has(b.id)) - Number(lobbies.has(a.id)) || b.updatedAt.localeCompare(a.updatedAt));
  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-5">
        <h2 className="font-pixel text-2xl">👥 Freunde</h2>
        <p className="mb-3 text-sm text-muted">
          Wartet ein Freund in einer Koop-Lobby, kannst du direkt beitreten – sofern dein Level reicht. Dein Name:{" "}
          <span className="text-parchment">@{myName}</span>
        </p>
        <AddFriendForm />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </section>

      {incoming.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-pixel mb-3 text-xl">Anfragen an dich</h3>
          <ul className="flex flex-col gap-2">
            {incoming.map((f) => (
              <FriendRow key={f.id} friend={f} detail="möchte mit dir befreundet sein">
                <RequestButtons friend={f} />
              </FriendRow>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-5">
        <h3 className="font-pixel mb-3 text-xl">
          Deine Freunde <span className="num text-sm text-muted">{accepted.length}</span>
        </h3>
        {!loaded && <p className="text-muted">Wird geladen …</p>}
        {loaded && accepted.length === 0 && (
          <p className="text-sm text-muted">Noch keine Freunde – schick oben eine Anfrage oder klicke im Profil eines Helden auf „Als Freund hinzufügen“.</p>
        )}
        <ul className="flex flex-col gap-2">
          {accepted.map((f) => {
            const lobby = lobbies.get(f.id);
            return (
              <FriendRow
                key={f.id}
                friend={f}
                highlight={!!lobby}
                detail={lobby ? <LobbyLine lobby={lobby} /> : `zuletzt aktiv ${lastSeenText(f.updatedAt, now)}`}
              >
                {lobby && <JoinButton friend={f} lobby={lobby} onJoined={onJoined} />}
                <RemoveButton friend={f} />
              </FriendRow>
            );
          })}
        </ul>
      </section>

      {outgoing.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-pixel mb-3 text-xl">Gesendete Anfragen</h3>
          <ul className="flex flex-col gap-2">
            {outgoing.map((f) => (
              <FriendRow key={f.id} friend={f} detail="wartet auf Antwort">
                <WithdrawButton friend={f} />
              </FriendRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddFriendForm() {
  const request = useFriendStore((s) => s.request);
  const busy = useFriendStore((s) => s.busy);
  const clearError = useFriendStore((s) => s.clearError);
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (await request(name)) {
          setName("");
          setSent(true);
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSent(false);
          clearError();
        }}
        placeholder="Benutzername"
        aria-label="Benutzername des Freundes"
        maxLength={21}
        className="min-w-0 flex-1 rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 outline-none focus:border-gold"
      />
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="rounded-md border-2 border-gold/70 px-3 py-1 text-sm text-gold hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Anfrage senden
      </button>
      {sent && <p className="w-full text-xs text-xp">✓ Gesendet.</p>}
    </form>
  );
}

function FriendRow({
  friend,
  detail,
  highlight = false,
  children,
}: {
  friend: Friend;
  detail: ReactNode;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-md border-2 bg-night-800 p-2 ${
        highlight ? "border-legendary/60" : "border-night-700"
      }`}
    >
      <AvatarFrame frame={friend.frame} className="rounded bg-night-950/60 p-0.5">
        <PixelAvatar size={40} equipment={friend.equipment} looks={friend.looks} />
      </AvatarFrame>
      <div className="min-w-0 flex-1">
        <a href={`#/held/${friend.username}`} className="block truncate font-semibold hover:text-gold">
          {friend.heroName} <span className="text-xs font-normal text-muted">@{friend.username}</span>{" "}
          <span className="text-xs font-normal text-gold">Lv. {friend.level}</span>
        </a>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </li>
  );
}

/** Name des Inhalts – null bei einer unbekannten Id (z. B. aus einer neueren App-Version). */
function contentOf(bossId: string) {
  try {
    return coopContent(bossId);
  } catch {
    return null;
  }
}

function LobbyLine({ lobby }: { lobby: LobbyPresence }) {
  const content = contentOf(lobby.bossId);
  return (
    <span className="text-legendary">
      ⚔️ In der Lobby: <b>{content?.name ?? "Koop-Kampf"}</b>
      {content && <span className="text-muted"> · ab Lv. {content.level}</span>} ·{" "}
      <span className="num">
        {lobby.members}/{COOP_MAX_PLAYERS}
      </span>
    </span>
  );
}

function JoinButton({ friend, lobby, onJoined }: { friend: Friend; lobby: LobbyPresence; onJoined: () => void }) {
  const myLevel = useGameStore((s) => getLevel(s.character.totalXp));
  const coopPhase = useCoopStore((s) => s.phase);
  const joinFriend = useCoopStore((s) => s.joinFriend);
  const joinError = useCoopStore((s) => s.joinError);
  const [joining, setJoining] = useState(false);
  const [failed, setFailed] = useState(false);
  const content = contentOf(lobby.bossId);

  const blocker = !content
    ? "Unbekannter Inhalt – lade die Seite neu."
    : myLevel < content.level
      ? `Ab Level ${content.level}`
      : lobby.members >= COOP_MAX_PLAYERS
        ? "Die Lobby ist voll."
        : coopPhase !== "idle" && !joining
          ? "Du bist schon in einer Koop-Lobby."
          : null;

  return (
    <span className="flex flex-col items-end">
      <motion.button
        whileTap={{ scale: 0.92 }}
        disabled={blocker !== null || joining}
        title={blocker ?? undefined}
        onClick={async () => {
          setJoining(true);
          setFailed(false);
          const ok = await joinFriend(friend.id);
          setJoining(false);
          if (ok) onJoined();
          else setFailed(true);
        }}
        className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-3 py-1 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {joining ? "Verbinde …" : "Beitreten"}
      </motion.button>
      {blocker && <span className="text-xs text-muted">{blocker}</span>}
      {failed && joinError && <span className="text-xs text-danger">{joinError}</span>}
    </span>
  );
}

function RequestButtons({ friend }: { friend: Friend }) {
  const accept = useFriendStore((s) => s.accept);
  const remove = useFriendStore((s) => s.remove);
  const busy = useFriendStore((s) => s.busy);
  return (
    <>
      <button
        disabled={busy}
        onClick={() => accept(friend.id)}
        className="rounded-md border-2 border-xp bg-xp/15 px-3 py-1 text-sm text-xp hover:bg-xp/25 disabled:opacity-40"
      >
        ✓ Annehmen
      </button>
      <button
        disabled={busy}
        onClick={() => remove(friend.id)}
        className="rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-parchment disabled:opacity-40"
      >
        Ablehnen
      </button>
    </>
  );
}

function WithdrawButton({ friend }: { friend: Friend }) {
  const remove = useFriendStore((s) => s.remove);
  const busy = useFriendStore((s) => s.busy);
  return (
    <button
      disabled={busy}
      onClick={() => remove(friend.id)}
      className="rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-parchment disabled:opacity-40"
    >
      Zurückziehen
    </button>
  );
}

function RemoveButton({ friend }: { friend: Friend }) {
  const remove = useFriendStore((s) => s.remove);
  const busy = useFriendStore((s) => s.busy);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button
        disabled={busy}
        onClick={() => setConfirm(true)}
        aria-label={`${friend.heroName} entfernen`}
        title="Entfernen"
        className="rounded-md border-2 border-night-700 px-2 py-1 text-sm text-muted hover:text-danger disabled:opacity-40"
      >
        ✕
      </button>
      <ConfirmDialog
        open={confirm}
        title="Freund entfernen?"
        confirmLabel="Entfernen"
        onConfirm={() => {
          setConfirm(false);
          void remove(friend.id);
        }}
        onCancel={() => setConfirm(false)}
      >
        {friend.heroName} (@{friend.username}) verschwindet aus deiner Freundesliste – und du aus der anderen.
      </ConfirmDialog>
    </>
  );
}

/** Auf der Profilseite: Anfrage senden bzw. Stand der Freundschaft zeigen. */
export function FriendButton({ username }: { username: string }) {
  const session = useCloudStore((s) => s.session);
  const myName = useCloudStore((s) => s.username);
  const { friends, loaded, busy, error, load, request, accept } = useFriendStore();
  useEffect(() => {
    if (session && !loaded) void load();
  }, [session, loaded, load]);
  if (!session || !myName || myName === username || !loaded) return null;

  const friend = friends.find((f) => f.username === username);
  const button = "mt-1 rounded-md border-2 px-3 py-1 text-sm disabled:opacity-40";
  return (
    <div className="flex flex-col items-center">
      {friend?.status === "accepted" ? (
        <a href="#/freunde" className="text-sm text-xp hover:underline">
          ✓ Ihr seid befreundet
        </a>
      ) : friend?.status === "outgoing" ? (
        <p className="text-sm text-muted">Anfrage gesendet</p>
      ) : friend?.status === "incoming" ? (
        <button disabled={busy} onClick={() => accept(friend.id)} className={`${button} border-xp bg-xp/15 text-xp hover:bg-xp/25`}>
          ✓ Anfrage annehmen
        </button>
      ) : (
        <button disabled={busy} onClick={() => request(username)} className={`${button} border-gold/70 text-gold hover:bg-gold/15`}>
          + Als Freund hinzufügen
        </button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
