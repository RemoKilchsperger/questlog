-- Freundesliste (docs/freunde.md): Anfragen und Freundschaften zwischen zwei Konten.
-- Der Browser schreibt direkt, RLS regelt, wer was darf. Ob ein Freund gerade eine
-- Koop-Lobby offen hat, steht nicht hier – das läuft über Realtime Presence.
-- Nur hinzufügend – bestehende Tabellen bleiben unverändert.
-- Ausführen: Supabase-Dashboard → SQL Editor (oder `supabase db push`).

create table if not exists public.friendships (
  -- ein Paar steht genau einmal da: die kleinere Id vorne
  user_a       uuid not null references auth.users (id) on delete cascade,
  user_b       uuid not null references auth.users (id) on delete cascade,
  -- wer gefragt hat – nur der andere darf annehmen
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);

alter table public.friendships enable row level security;

drop policy if exists "Beteiligte lesen ihre Freundschaft" on public.friendships;
create policy "Beteiligte lesen ihre Freundschaft" on public.friendships
  for select using (auth.uid() in (user_a, user_b));

-- Anfragen: nur im eigenen Namen, höchstens 50 offene gleichzeitig (gegen Spam)
drop policy if exists "Freundschaftsanfrage senden" on public.friendships;
create policy "Freundschaftsanfrage senden" on public.friendships
  for insert with check (
    requested_by = auth.uid()
    and status = 'pending'
    and (select count(*) from public.friendships f where f.requested_by = auth.uid() and f.status = 'pending') < 50
  );

-- Annehmen: nur der Gefragte. Ändern lässt sich ausschliesslich `status` (siehe grant unten).
drop policy if exists "Freundschaftsanfrage annehmen" on public.friendships;
create policy "Freundschaftsanfrage annehmen" on public.friendships
  for update using (auth.uid() in (user_a, user_b) and auth.uid() <> requested_by)
  with check (status = 'accepted');

-- Ablehnen, zurückziehen, entfreunden: beide Seiten
drop policy if exists "Freundschaft beenden" on public.friendships;
create policy "Freundschaft beenden" on public.friendships
  for delete using (auth.uid() in (user_a, user_b));

revoke update on public.friendships from anon, authenticated;
grant update (status) on public.friendships to authenticated;

-- Die Liste eines Spielers schnell finden (user_a steckt schon im Primärschlüssel)
create index if not exists friendships_user_b on public.friendships (user_b);
create index if not exists friendships_pending on public.friendships (requested_by) where status = 'pending';
