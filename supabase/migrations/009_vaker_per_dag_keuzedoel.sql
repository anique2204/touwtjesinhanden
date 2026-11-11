-- =====================================================================
-- LockedIn — doelen meerdere keren per dag, keuzedoelen en herinneringstijden
-- =====================================================================

alter table public.habits add column if not exists per_day int not null default 1;
alter table public.habits add column if not exists options text[] not null default '{}';
alter table public.habits add column if not exists reminder_times text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_per_day_check') then
    alter table public.habits add constraint habits_per_day_check check (per_day between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habits_options_check') then
    alter table public.habits add constraint habits_options_check check (cardinality(options) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habits_reminders_check') then
    alter table public.habits add constraint habits_reminders_check check (cardinality(reminder_times) <= 6);
  end if;
end $$;

-- Teller per dag en welke keuze je deed (als nummer in de keuzelijst, zodat een privé keuze niet uitlekt)
alter table public.habit_checks add column if not exists count int not null default 1;
alter table public.habit_checks add column if not exists option text;
alter table public.habit_checks add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habit_checks_count_check') then
    alter table public.habit_checks add constraint habit_checks_count_check check (count between 1 and 20);
  end if;
end $$;

drop policy if exists "checks update" on public.habit_checks;
create policy "checks update" on public.habit_checks for update
  using (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl())
  with check (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl());

-- group_habits: nu ook per_day en keuzes (keuzes verborgen bij privé doelen van anderen)
drop function if exists public.group_habits(uuid);
create function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz, difficulty text,
  per_day int, options text[], reminder_times text[]
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at, h.difficulty,
    h.per_day,
    case when h.is_private and h.user_id <> auth.uid() then '{}'::text[] else h.options end,
    case when h.user_id = auth.uid() then h.reminder_times else '{}'::text[] end   -- herinneringen alleen voor jezelf
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;
