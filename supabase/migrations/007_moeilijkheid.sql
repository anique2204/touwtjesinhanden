-- =====================================================================
-- LockedIn — moeilijkheid per doel (makkelijk / normaal / moeilijk)
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.habits add column if not exists difficulty text not null default 'normaal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_difficulty_check') then
    alter table public.habits add constraint habits_difficulty_check check (difficulty in ('makkelijk', 'normaal', 'moeilijk'));
  end if;
end $$;

-- group_habits geeft nu ook de moeilijkheid terug (zichtbaar voor de groep, ook bij privé doelen)
drop function if exists public.group_habits(uuid);
create function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz, difficulty text
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at, h.difficulty
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;
