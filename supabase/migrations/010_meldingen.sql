-- =====================================================================
-- LockedIn — pushmeldingen: abonnementen per toestel, voorkeuren per persoon,
-- en een logboek (alleen voor de server) om dubbele meldingen te voorkomen.
-- =====================================================================

-- Eén rij per toestel/browser dat meldingen mag ontvangen
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Wat iemand wil ontvangen (privé)
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  morning boolean not null default true,
  morning_time text not null default '08:00',
  evening boolean not null default true,
  evening_time text not null default '19:00',
  habit_reminders boolean not null default true,
  reactions boolean not null default true,
  group_all_done boolean not null default true,
  group_hard_goal boolean not null default true,
  broadcasts boolean not null default true,
  quiet_start text not null default '22:00',
  quiet_end text not null default '08:00',
  updated_at timestamptz not null default now(),
  check (morning_time ~ '^[0-2][0-9]:[0-5][0-9]$' and evening_time ~ '^[0-2][0-9]:[0-5][0-9]$'
     and quiet_start ~ '^[0-2][0-9]:[0-5][0-9]$' and quiet_end ~ '^[0-2][0-9]:[0-5][0-9]$')
);
alter table public.notification_prefs enable row level security;
drop policy if exists "prefs own" on public.notification_prefs;
create policy "prefs own" on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Alleen voor de server (geen policies = niemand anders kan erbij)
create table if not exists public.notification_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.notification_log enable row level security;

create table if not exists public.notify_watermarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  last_at timestamptz not null,
  primary key (user_id, kind)
);
alter table public.notify_watermarks enable row level security;

-- Oude logregels opruimen kan later; voor 5 mensen is dit klein.
