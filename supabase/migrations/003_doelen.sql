-- =====================================================================
-- De touwtjes in handen — doelen (gewoontes), afvinken en high fives
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run".
-- Veilig om opnieuw te draaien.
-- =====================================================================

-- ---------- Doelen ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  emoji text not null default '🎯' check (char_length(emoji) <= 16),
  per_week int not null default 7 check (per_week between 1 and 7),   -- 7 = elke dag
  is_private boolean not null default false,
  start_date date not null default public.today_nl(),
  archived_on date,                                                   -- gestopt vanaf deze dag
  created_at timestamptz not null default now()
);
create index if not exists habits_group on public.habits (group_id);

alter table public.habits enable row level security;
-- Rechtstreeks alleen je eigen doelen. Anderen lezen via group_habits() (privé-titels afgeschermd).
drop policy if exists "habits own" on public.habits;
create policy "habits own" on public.habits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(group_id));

-- Doelen van de groep; bij privé-doelen van anderen worden titel en emoji verborgen.
drop function if exists public.group_habits(uuid);
create or replace function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;

create or replace function public.habit_group(hid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from habits where id = hid;
$$;

-- ---------- Afvinken ----------
create table if not exists public.habit_checks (
  habit_id uuid not null references public.habits on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, check_date)
);
create index if not exists habit_checks_group_date on public.habit_checks (group_id, check_date);

alter table public.habit_checks enable row level security;
drop policy if exists "checks read" on public.habit_checks;
create policy "checks read" on public.habit_checks for select using (public.is_member(group_id));
drop policy if exists "checks insert" on public.habit_checks;
create policy "checks insert" on public.habit_checks for insert
  with check (
    user_id = auth.uid()
    and group_id = public.habit_group(habit_id)
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and check_date between public.today_nl() - 2 and public.today_nl()
  );
drop policy if exists "checks delete" on public.habit_checks;
create policy "checks delete" on public.habit_checks for delete
  using (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl());

-- ---------- High fives ----------
create table if not exists public.cheers (
  group_id uuid not null references public.groups on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day),
  check (from_user <> to_user)
);
create index if not exists cheers_group_day on public.cheers (group_id, day);

alter table public.cheers enable row level security;
drop policy if exists "cheers read" on public.cheers;
create policy "cheers read" on public.cheers for select using (public.is_member(group_id));
drop policy if exists "cheers insert" on public.cheers;
create policy "cheers insert" on public.cheers for insert
  with check (
    from_user = auth.uid() and public.is_member(group_id)
    and exists (select 1 from public.group_members m where m.group_id = cheers.group_id and m.user_id = to_user)
    and day between public.today_nl() - 7 and public.today_nl()
  );
drop policy if exists "cheers delete" on public.cheers;
create policy "cheers delete" on public.cheers for delete using (from_user = auth.uid());

-- ---------- Trainingsdoel kunnen uitzetten ----------
drop policy if exists "goals delete" on public.weekly_goals;
create policy "goals delete" on public.weekly_goals for delete using (user_id = auth.uid());

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['habit_checks', 'cheers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
