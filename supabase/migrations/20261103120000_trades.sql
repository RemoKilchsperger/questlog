-- Item-Tausch (docs/item-tausch.md): Tausche zwischen zwei Spielern liegen in der
-- Datenbank, die Edge Function "trade" ist die einzige, die sie schreibt.
-- Dazu ein Register, wem getauschte Items gehören, und ein Trigger, der alte
-- Spielstände mit schon weggetauschten Items ablehnt.
-- Nur hinzufügend – bestehende Tabellen bleiben unverändert.
-- Ausführen: Supabase-Dashboard → SQL Editor (oder `supabase db push`).

create table if not exists public.trades (
  id           uuid primary key,
  -- Einladungscode (6 Zeichen ohne verwechselbare wie 0/O, 1/I/L)
  code         text not null unique check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  -- wer eröffnet hat, steht vorne; höchstens zwei
  player_ids   uuid[] not null check (cardinality(player_ids) between 1 and 2),
  names        jsonb not null default '{}'::jsonb,
  -- { userId: OwnedItem[] } – vom Server gegen den Spielstand geprüft
  offers       jsonb not null default '{}'::jsonb,
  ready        jsonb not null default '{}'::jsonb,
  confirmed    jsonb not null default '{}'::jsonb,
  status       text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  -- steigt bei jeder Änderung: schützt vor gleichzeitigem Überschreiben
  version      int not null default 1,
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.trades enable row level security;

-- Lesen dürfen nur die zwei Beteiligten. Schreiben darf niemand direkt – nur die
-- Edge Function mit dem Service-Schlüssel (der RLS umgeht).
drop policy if exists "Beteiligte lesen ihren Tausch" on public.trades;
create policy "Beteiligte lesen ihren Tausch" on public.trades
  for select using (auth.uid() = any (player_ids));

create index if not exists trades_players on public.trades using gin (player_ids);
create index if not exists trades_updated on public.trades (updated_at);

-- ─── Wem getauschte Items gehören ───────────────────────────────────────────
-- Nur Items, die schon einmal getauscht wurden. Fehlt eine uid, gehört das Item
-- dem, in dessen Spielstand es liegt.
create table if not exists public.item_owners (
  uid        text primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  -- wer es zuletzt hergegeben hat – damit dessen Client es aus dem Spielstand entfernen kann
  from_id    uuid not null references auth.users (id) on delete cascade,
  trade_id   uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.item_owners enable row level security;

drop policy if exists "Eigene getauschte Items lesen" on public.item_owners;
create policy "Eigene getauschte Items lesen" on public.item_owners
  for select using (auth.uid() = owner_id or auth.uid() = from_id);

create index if not exists item_owners_from on public.item_owners (from_id);

-- Beim Abschluss eines Tauschs: neue Besitzer eintragen. Gehört ein Item laut
-- Register schon jemand anderem (zweimal angeboten, alter Spielstand), scheitert
-- der ganze Abschluss – in derselben Transaktion wie das Update auf `trades`.
create or replace function public.register_traded_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  giver uuid;
  receiver uuid;
  item jsonb;
  current_owner uuid;
begin
  if new.status <> 'done' or old.status = 'done' then
    return new;
  end if;
  foreach giver in array new.player_ids loop
    select p into receiver from unnest(new.player_ids) as p where p <> giver;
    for item in select value from jsonb_array_elements(coalesce(new.offers -> giver::text, '[]'::jsonb)) loop
      current_owner := null;
      select owner_id into current_owner from public.item_owners where uid = item ->> 'uid' for update;
      if current_owner is not null and current_owner <> giver then
        raise exception 'QL_ITEM_TRADED %', item ->> 'uid';
      end if;
      insert into public.item_owners (uid, owner_id, from_id, trade_id)
      values (item ->> 'uid', receiver, giver, new.id)
      on conflict (uid) do update
        set owner_id = excluded.owner_id, from_id = excluded.from_id, trade_id = excluded.trade_id, updated_at = now();
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists trades_register_items on public.trades;
create trigger trades_register_items
  before update on public.trades
  for each row execute function public.register_traded_items();

-- Schutz gegen das Zurückspielen: Ein Spielstand darf nirgends (Inventar,
-- Ausrüstung, Begleiter …) eine uid enthalten, die laut Register jemand anderem
-- gehört. Der Client führt dann erst die offenen Tausche aus (Etappe 4).
create or replace function public.reject_foreign_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  foreign_uid text;
begin
  select o.uid into foreign_uid
  from jsonb_path_query(new.data, 'lax $.**.uid') as u(value)
  join public.item_owners o on o.uid = u.value #>> '{}'
  where jsonb_typeof(u.value) = 'string' and o.owner_id <> new.user_id
  limit 1;
  if foreign_uid is not null then
    raise exception 'QL_FOREIGN_ITEM %', foreign_uid
      using hint = 'Der Spielstand enthält ein Item, das an jemand anderen getauscht wurde.';
  end if;
  return new;
end $$;

drop trigger if exists saves_reject_foreign_items on public.saves;
create trigger saves_reject_foreign_items
  before insert or update on public.saves
  for each row execute function public.reject_foreign_items();

-- Änderungen live an die Beteiligten schicken (Supabase Realtime, beachtet RLS)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades'
  ) then
    alter publication supabase_realtime add table public.trades;
  end if;
end $$;
