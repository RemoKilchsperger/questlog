import { useEffect, useState, type ReactNode } from "react";
import { isLobbyCode } from "../coop/protocol";
import { getItemStats } from "../domain/items";
import { getLevel } from "../domain/leveling";
import { TRADE_DAILY_LIMIT, TRADE_MAX_ITEMS, TRADE_MIN_LEVEL, tradeBlockReason } from "../domain/trade";
import type { OwnedItem } from "../domain/types";
import { useCloudStore } from "../cloud/cloudStore";
import { useGameStore } from "../store/gameStore";
import { availableTradeBackend } from "../trade/backend";
import type { TradeRow } from "../trade/protocol";
import { partnerOf } from "../trade/server";
import { useTradeStore, type TradeResult } from "../trade/tradeStore";
import { Hint } from "./HoverCard";
import { InventoryPanel } from "./InventoryPanel";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { itemName, RARITY_TEXT } from "./itemUi";

/** Dorf → Tausch: Items mit einem anderen Spieler tauschen (docs/item-tausch.md). */
export function TradeScreen() {
  const loggedIn = useCloudStore((s) => s.session !== null);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const row = useTradeStore((s) => s.row);
  const result = useTradeStore((s) => s.result);
  const resume = useTradeStore((s) => s.resume);

  // Offenen Tausch wieder aufnehmen, verpasste Abschlüsse ausführen
  useEffect(() => {
    void resume();
  }, [resume, loggedIn]);

  if (!availableTradeBackend(loggedIn)) {
    return (
      <Notice icon="🤝" title="Tauschen braucht ein Konto">
        Melde dich oben mit deinem Online-Konto an. Getauscht wird über den Server, damit beide sicher bekommen, was
        abgemacht ist.
      </Notice>
    );
  }
  if (level < TRADE_MIN_LEVEL) {
    return (
      <Notice icon="🔒" title={`Tauschen ab Level ${TRADE_MIN_LEVEL}`}>
        Mit anderen Spielern Items tauschen kannst du ab Level {TRADE_MIN_LEVEL}.
      </Notice>
    );
  }
  if (!row || row.status !== "open") return <TradeStart row={row} result={result} />;
  return <TradeWindow row={row} />;
}

function Notice({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="panel mx-auto flex max-w-lg flex-col items-center gap-3 p-6 text-center">
      <span className="text-5xl" aria-hidden>
        {icon}
      </span>
      <h2 className="font-pixel text-2xl">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </section>
  );
}

/** Kein offener Tausch: eröffnen oder per Code beitreten – davor das Ergebnis des letzten. */
function TradeStart({ row, result }: { row: TradeRow | null; result: TradeResult | null }) {
  const createTrade = useTradeStore((s) => s.createTrade);
  const joinTrade = useTradeStore((s) => s.joinTrade);
  const close = useTradeStore((s) => s.close);
  const busy = useTradeStore((s) => s.busy);
  const error = useTradeStore((s) => s.error);
  const clearError = useTradeStore((s) => s.clearError);
  const [code, setCode] = useState("");
  const cleanCode = code.trim().toUpperCase();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      {result && <TradeResultCard result={result} onClose={close} />}
      {row?.status === "cancelled" && !result && (
        <section className="panel p-5 text-center">
          <p className="font-pixel text-xl text-muted">Tausch abgebrochen</p>
          <p className="mt-1 text-sm text-muted">Alle Items sind bei ihren Besitzern geblieben.</p>
          <button onClick={close} className="mt-3 rounded-md border-2 border-night-700 px-3 py-1 text-sm hover:text-parchment">
            Schliessen
          </button>
        </section>
      )}

      <section className="panel flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-pixel text-2xl">🤝 Tauschen</h2>
          <p className="text-sm text-muted">
            Tausche Items direkt mit einem anderen Spieler: Eröffne einen Tausch und gib ihm den Code, oder tritt mit
            seinem Code bei. Bis zu {TRADE_MAX_ITEMS} Items pro Seite, höchstens {TRADE_DAILY_LIMIT} Tausche in 24
            Stunden. Boss-Items lassen sich nicht tauschen.
          </p>
        </div>
        <button
          onClick={() => void createTrade()}
          disabled={busy}
          className="font-pixel self-start rounded-md border-2 border-gold bg-gold/15 px-4 py-1.5 text-gold hover:bg-gold/25 disabled:opacity-40"
        >
          Tausch eröffnen
        </button>
        <form
          className="border-t border-night-700 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (isLobbyCode(cleanCode)) void joinTrade(cleanCode);
          }}
        >
          <label htmlFor="trade-code" className="mb-1 block text-xs uppercase tracking-wide text-muted">
            Code des Tauschpartners
          </label>
          <div className="flex gap-2">
            <input
              id="trade-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) clearError();
              }}
              placeholder="Code"
              maxLength={6}
              className="num min-w-0 flex-1 rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 uppercase tracking-widest outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={!isLobbyCode(cleanCode) || busy}
              className="rounded-md border-2 border-gold/70 px-3 py-1 text-sm text-gold hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Beitreten
            </button>
          </div>
        </form>
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>
    </div>
  );
}

function TradeResultCard({ result, onClose }: { result: TradeResult; onClose: () => void }) {
  return (
    <section className="panel border-xp/60 p-5">
      <p className="font-pixel text-xl text-xp">✔ Tausch mit {result.partner} abgeschlossen</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <OfferList title="Erhalten" items={result.received} empty="Nichts – ein Geschenk von dir." />
        <OfferList title="Abgegeben" items={result.given} empty="Nichts – ein Geschenk für dich." />
      </div>
      <button onClick={onClose} className="mt-3 rounded-md border-2 border-night-700 px-3 py-1 text-sm hover:text-parchment">
        Schliessen
      </button>
    </section>
  );
}

/** Offener Tausch: beide Angebote, Bereit/Tauschen, daneben das eigene Inventar. */
function TradeWindow({ row }: { row: TradeRow }) {
  const myId = useTradeStore((s) => s.myId);
  const busy = useTradeStore((s) => s.busy);
  const error = useTradeStore((s) => s.error);
  const toggleItem = useTradeStore((s) => s.toggleItem);
  const setReady = useTradeStore((s) => s.setReady);
  const confirm = useTradeStore((s) => s.confirm);
  const cancel = useTradeStore((s) => s.cancel);
  const [copied, setCopied] = useState(false);

  const partner = partnerOf(row, myId);
  const mine = row.offers[myId] ?? [];
  const theirs = partner ? (row.offers[partner] ?? []) : [];
  const iAmReady = !!row.ready[myId];
  const partnerReady = !!(partner && row.ready[partner]);
  const iConfirmed = !!row.confirmed[myId];
  const partnerConfirmed = !!(partner && row.confirmed[partner]);
  const bothReady = iAmReady && partnerReady;
  const empty = mine.length === 0 && theirs.length === 0;
  const partnerName = partner ? row.names[partner] : null;

  const status = !partner
    ? "Warte auf deinen Tauschpartner – gib ihm den Code."
    : iConfirmed
      ? `Du hast bestätigt. Warte auf ${partnerName}.`
      : partnerConfirmed
        ? `${partnerName} hat bestätigt – jetzt du.`
        : bothReady
          ? "Beide bereit. Prüfe den Tausch und bestätige."
          : "Legt eure Items hinein und klickt „Bereit“. Jede Änderung setzt „Bereit“ bei beiden zurück.";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-pixel text-2xl">🤝 Tausch{partnerName && ` mit ${partnerName}`}</h2>
          <div className="text-right">
            <p className="text-xs text-muted">Code</p>
            <button
              onClick={() => void navigator.clipboard?.writeText(row.code).then(() => setCopied(true))}
              className="num text-2xl tracking-[0.3em] text-gold"
              aria-label={`Code ${row.code} kopieren`}
            >
              {row.code}
            </button>
            {copied && <p className="text-xs text-xp">kopiert</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <OfferList
            title={`Du gibst (${mine.length}/${TRADE_MAX_ITEMS})`}
            items={mine}
            empty="Wähle rechts Items aus deinem Inventar."
            badge={<ReadyBadge ready={iAmReady} confirmed={iConfirmed} />}
            onRemove={(uid) => void toggleItem(uid)}
            disabled={busy}
          />
          <OfferList
            title={partnerName ? `${partnerName} gibt` : "Du bekommst"}
            items={theirs}
            empty={partner ? "Noch nichts angeboten." : "Noch niemand beigetreten."}
            badge={partner && <ReadyBadge ready={partnerReady} confirmed={partnerConfirmed} />}
          />
        </div>

        <p className="text-sm text-muted">{status}</p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void setReady(!iAmReady)}
            disabled={busy || !partner}
            aria-pressed={iAmReady}
            className={`font-pixel rounded-md border-2 px-4 py-1.5 disabled:opacity-40 ${
              iAmReady ? "border-xp bg-xp/15 text-xp" : "border-gold/70 text-gold hover:bg-gold/15"
            }`}
          >
            {iAmReady ? "✔ Bereit" : "Bereit"}
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy || !bothReady || iConfirmed || empty}
            className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-4 py-1.5 text-gold hover:bg-gold/25 disabled:opacity-40"
          >
            Tauschen
          </button>
          <button
            onClick={() => void cancel()}
            disabled={busy}
            className="ml-auto rounded-md border-2 border-night-700 px-3 py-1 text-sm text-muted hover:text-danger"
          >
            Abbrechen
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">
          Items in deinem Angebot sind gesperrt: Du kannst sie nicht verkaufen, zerlegen, verbessern oder anlegen, bis
          der Tausch vorbei ist.
        </p>
      </section>

      <InventoryPanel
        title="Dein Inventar"
        emptyText="Dein Inventar ist leer. Angelegte Items musst du erst ablegen."
        actions={(owned) => <OfferButton owned={owned} offered={mine.some((i) => i.uid === owned.uid)} full={mine.length >= TRADE_MAX_ITEMS} busy={busy} onClick={() => void toggleItem(owned.uid)} />}
      />
    </div>
  );
}

function OfferButton({ owned, offered, full, busy, onClick }: { owned: OwnedItem; offered: boolean; full: boolean; busy: boolean; onClick: () => void }) {
  const blocked = tradeBlockReason(owned);
  if (blocked) {
    return (
      <Hint text={blocked}>
        <span className="text-xs text-muted">🔒 nicht tauschbar</span>
      </Hint>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={busy || (!offered && full)}
      className={`rounded-md border-2 px-2 py-0.5 text-xs disabled:opacity-40 ${
        offered ? "border-danger/60 text-danger hover:bg-danger/10" : "border-gold/70 text-gold hover:bg-gold/15"
      }`}
    >
      {offered ? "Herausnehmen" : "Anbieten"}
    </button>
  );
}

function ReadyBadge({ ready, confirmed }: { ready: boolean; confirmed: boolean }) {
  if (confirmed) return <span className="text-xs text-xp">✔ bestätigt</span>;
  if (ready) return <span className="text-xs text-xp">bereit</span>;
  return <span className="text-xs text-muted">nicht bereit</span>;
}

function OfferList({
  title,
  items,
  empty,
  badge,
  onRemove,
  disabled,
}: {
  title: string;
  items: OwnedItem[];
  empty: string;
  badge?: ReactNode;
  onRemove?: (uid: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-md border-2 border-night-700 bg-night-950/60 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-muted">{title}</h3>
        {badge}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => {
            const stats = getItemStats(item);
            return (
              <li key={item.uid} className="flex items-center gap-2">
                <ItemTooltip stats={stats}>
                  <ItemIcon def={stats.def} rarity={stats.rarity} size={28} />
                </ItemTooltip>
                <span className={`min-w-0 flex-1 truncate text-sm ${RARITY_TEXT[stats.rarity]}`}>{itemName(stats)}</span>
                <span className="text-xs text-muted">Lv. {stats.def.requiredLevel}</span>
                {onRemove && (
                  <button
                    onClick={() => onRemove(item.uid)}
                    disabled={disabled}
                    aria-label={`${itemName(stats)} herausnehmen`}
                    className="text-xs text-muted hover:text-danger disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
