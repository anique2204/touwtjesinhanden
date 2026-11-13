-- LockedIn — per verstuurde melding vastleggen hoeveel toestellen hem kregen en welke fout er was
alter table public.notification_log add column if not exists delivered int;
alter table public.notification_log add column if not exists error text;
alter table public.notification_log add column if not exists title text;
