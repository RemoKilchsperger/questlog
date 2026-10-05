import { useState } from "react";
import { summarizeSave, type SaveSummary } from "../cloud/publicProfile";
import { useCloudStore } from "../cloud/cloudStore";
import { cloudEnabled } from "../cloud/supabase";
import { SAVE_KEY } from "../store/gameStore";
import { Modal } from "./Modal";

const STATUS_TEXT = {
  offline: "nicht angemeldet",
  loading: "wird geladen …",
  saving: "wird gespeichert …",
  saved: "in der Cloud gespeichert",
  error: "Fehler beim Speichern",
} as const;

/** Knopf im HUD: Anmelden bzw. Konto & Speicherstatus. Unsichtbar ohne Online-Konfiguration. */
export function CloudButton() {
  const [open, setOpen] = useState(false);
  const session = useCloudStore((s) => s.session);
  const username = useCloudStore((s) => s.username);
  const status = useCloudStore((s) => s.status);
  if (!cloudEnabled) return null;

  const icon = !session ? "☁️" : status === "error" ? "⚠️" : status === "saving" || status === "loading" ? "⏳" : "✅";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={session ? `Online: ${STATUS_TEXT[status]}` : "Anmelden, um online zu speichern"}
        className="shrink-0 rounded-md bg-night-800 px-3 py-2 text-sm hover:ring-2 hover:ring-gold/60"
      >
        <span aria-hidden>{icon}</span>{" "}
        <span className="hidden sm:inline">{session ? (username ?? "Konto") : "Anmelden"}</span>
      </button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useCloudStore((s) => s.session);
  const username = useCloudStore((s) => s.username);
  const status = useCloudStore((s) => s.status);
  const error = useCloudStore((s) => s.error);
  const sendLoginLink = useCloudStore((s) => s.sendLoginLink);
  const signOut = useCloudStore((s) => s.signOut);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <Modal open={open} title={session ? "Dein Konto" : "Online spielen"} onClose={onClose}>
      {session ? (
        <div className="flex flex-col gap-3">
          <p>
            Angemeldet als <span className="text-gold">{session.user.email}</span>
            {username && (
              <>
                {" "}
                · öffentliches Profil{" "}
                <a href={`#/held/${username}`} onClick={onClose} className="text-gold underline">
                  {username}
                </a>
              </>
            )}
          </p>
          <p className={status === "error" ? "text-danger" : "text-muted"}>
            Spielstand: {STATUS_TEXT[status]}
            {error && ` – ${error}`}
          </p>
          <p className="text-xs text-muted">
            Dein Fortschritt wird automatisch gespeichert und ist auf jedem Gerät verfügbar, auf dem du dich anmeldest.
            Andere sehen nur Level, Ausrüstung, Attribute und Sammlung – deine Quests bleiben privat.
          </p>
          <button
            onClick={() => void signOut().then(onClose)}
            className="self-start rounded-md border-2 border-night-700 px-3 py-1 text-muted hover:text-parchment"
          >
            Abmelden
          </button>
        </div>
      ) : sent ? (
        <p>
          📬 Wir haben dir einen Login-Link an <span className="text-gold">{email}</span> geschickt. Öffne ihn auf diesem
          Gerät – danach bist du angemeldet.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLoginLink(email).then((ok) => ok && setSent(true));
          }}
        >
          <p className="text-muted">
            Melde dich mit deiner E-Mail-Adresse an, um deinen Fortschritt online zu speichern und in der Rangliste zu
            erscheinen. Du bekommst einen Link – kein Passwort nötig.
          </p>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deine@email.ch"
            className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none focus:border-gold"
          />
          {error && <p className="text-danger">{error}</p>}
          <button className="font-pixel self-end rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25">
            Login-Link senden
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Pflicht-Dialoge nach dem Login: Benutzernamen wählen, Spielstand-Konflikt lösen. */
export function CloudDialogs() {
  const needsUsername = useCloudStore((s) => s.needsUsername);
  const conflict = useCloudStore((s) => s.conflict);
  return (
    <>
      <UsernameDialog open={needsUsername && !conflict} />
      <ConflictDialog />
    </>
  );
}

function UsernameDialog({ open }: { open: boolean }) {
  const chooseUsername = useCloudStore((s) => s.chooseUsername);
  const error = useCloudStore((s) => s.error);
  const [name, setName] = useState("");
  return (
    <Modal open={open} title="Wähle deinen Namen">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void chooseUsername(name);
        }}
      >
        <p className="text-muted">
          Unter diesem Namen erscheinst du in der Rangliste, und andere finden dein Profil. 3–20 Zeichen:
          Kleinbuchstaben, Ziffern, _ und -.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="z. B. remo"
          className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none focus:border-gold"
        />
        {error && <p className="text-danger">{error}</p>}
        <button className="font-pixel self-end rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25">
          Speichern
        </button>
      </form>
    </Modal>
  );
}

function ConflictDialog() {
  const conflict = useCloudStore((s) => s.conflict);
  const resolve = useCloudStore((s) => s.resolveConflict);
  const local = readLocalSummary();
  return (
    <Modal open={conflict !== null} title="Welchen Spielstand behalten?">
      {conflict && local && (
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            Auf diesem Gerät und in der Cloud liegen unterschiedliche Spielstände. Der andere wird überschrieben.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <SaveCard label="Dieses Gerät" summary={local} onChoose={() => void resolve("local")} />
            <SaveCard label="Cloud" summary={summarizeSave(conflict)} onChoose={() => void resolve("cloud")} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function readLocalSummary(): SaveSummary | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? summarizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function SaveCard({ label, summary, onChoose }: { label: string; summary: SaveSummary; onChoose: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border-2 border-night-700 bg-night-800 p-3">
      <p className="font-pixel text-lg text-gold">{label}</p>
      <p>{summary.heroName}</p>
      <p className="text-xs text-muted">
        Level <span className="num text-parchment">{summary.level}</span> · <span className="num">{summary.totalXp}</span>{" "}
        XP
      </p>
      <p className="text-xs text-muted">
        <span className="num">{summary.questsDone}</span> Quests · <span className="num">{summary.bossItems}</span>{" "}
        Boss-Items
      </p>
      <button
        onClick={onChoose}
        className="font-pixel mt-2 rounded-md border-2 border-gold bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
      >
        Diesen behalten
      </button>
    </div>
  );
}
