-- =====================================================================
-- De touwtjes in handen — trainingen wijzigen
-- Je mag je eigen trainingen altijd aanpassen (duur, afstand, notitie, foto…).
-- De datum verplaatsen kan alleen naar vandaag, gisteren of eergisteren.
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

drop policy if exists "activities update" on public.activities;
create policy "activities update" on public.activities for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.guard_activity_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.group_id <> old.group_id then
    raise exception 'Een training kan niet naar een andere groep';
  end if;
  if new.activity_date <> old.activity_date
     and new.activity_date not between public.today_nl() - 2 and public.today_nl() then
    raise exception 'Je kunt een training alleen verplaatsen naar vandaag, gisteren of eergisteren';
  end if;
  return new;
end; $$;

drop trigger if exists guard_activity_update on public.activities;
create trigger guard_activity_update before update on public.activities
  for each row execute function public.guard_activity_update();
