-- =====================================================================
-- LockedIn — extra metingen (heupen, borst, bovenarm, bovenbeen, vetpercentage)
-- en per persoon instellen welke metingen je bijhoudt (+ lengte voor verhoudingen).
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.measurements add column if not exists hips_cm numeric(5, 1);
alter table public.measurements add column if not exists chest_cm numeric(5, 1);
alter table public.measurements add column if not exists arm_cm numeric(5, 1);
alter table public.measurements add column if not exists thigh_cm numeric(5, 1);
alter table public.measurements add column if not exists fat_pct numeric(4, 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'measurements_extra_check') then
    alter table public.measurements add constraint measurements_extra_check check (
      (hips_cm is null or hips_cm between 40 and 250)
      and (chest_cm is null or chest_cm between 40 and 250)
      and (arm_cm is null or arm_cm between 10 and 80)
      and (thigh_cm is null or thigh_cm between 20 and 120)
      and (fat_pct is null or fat_pct between 3 and 70)
    );
  end if;
end $$;

-- Welke metingen iemand bijhoudt, en lengte (voor de taille-lengteverhouding). Privé.
alter table public.private_settings add column if not exists measure_fields text[] not null default '{weight_kg,waist_cm,belly_cm}';
alter table public.private_settings add column if not exists height_cm numeric(4, 1);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'private_settings_height_check') then
    alter table public.private_settings add constraint private_settings_height_check check (height_cm is null or height_cm between 100 and 230);
  end if;
end $$;
