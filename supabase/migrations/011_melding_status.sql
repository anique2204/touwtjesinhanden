-- LockedIn — per toestel bijhouden hoe het laatste versturen afliep (voor foutopsporing)
alter table public.push_subscriptions add column if not exists last_status int;
alter table public.push_subscriptions add column if not exists last_error text;
alter table public.push_subscriptions add column if not exists last_sent_at timestamptz;
