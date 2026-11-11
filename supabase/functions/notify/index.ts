// =====================================================================
// LockedIn — meldingen versturen (Supabase Edge Function "notify")
//
// Acties (POST, JSON body { action }):
//   tick       elke 5 min via de planning (pg_cron): ochtend/avond/doel-herinneringen,
//              reacties, groepsnieuws. Vereist header x-cron-secret.
//   selftest   controleert of het versturen werkt (zonder echte melding). x-cron-secret.
//   test       stuurt een testmelding naar jezelf. Vereist ingelogde gebruiker.
//   broadcast  admin stuurt een bericht naar de groep. Vereist ingelogde admin.
//
// Geheimen (Supabase > Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn er automatisch.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const APP_URL = 'https://touwtjesinhanden.vercel.app';
const BREUKELEN = { lat: 52.17, lon: 5.0 };
const WINDOW_MIN = 15; // een geplande melding mag tot 15 min na de tijd nog verstuurd worden

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
webpush.setVapidDetails(APP_URL, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---------- Tijd in Nederland ----------
function nowNL() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const isDue = (t: string, now: number) => { const d = now - toMin(t); return d >= 0 && d < WINDOW_MIN; };
const inQuiet = (now: number, start: string, end: string) => {
  const a = toMin(start), b = toMin(end);
  return a <= b ? now >= a && now < b : now >= a || now < b;
};

// ---------- Types ----------
type Prefs = {
  user_id: string; morning: boolean; morning_time: string; evening: boolean; evening_time: string;
  habit_reminders: boolean; reactions: boolean; group_all_done: boolean; group_hard_goal: boolean;
  broadcasts: boolean; quiet_start: string; quiet_end: string;
};
const DEFAULT_PREFS: Omit<Prefs, 'user_id'> = {
  morning: true, morning_time: '08:00', evening: true, evening_time: '19:00', habit_reminders: true,
  reactions: true, group_all_done: true, group_hard_goal: true, broadcasts: true, quiet_start: '22:00', quiet_end: '08:00',
};
type Habit = {
  id: string; user_id: string; group_id: string; title: string; emoji: string; per_week: number; per_day: number;
  options: string[]; reminder_times: string[]; difficulty: string; is_private: boolean; start_date: string; archived_on: string | null;
};
type Check = { habit_id: string; user_id: string; check_date: string; count: number; option: string | null };
type Payload = { title: string; body: string; url?: string; tag?: string };

// ---------- Versturen ----------
async function sendTo(userId: string, payload: Payload): Promise<number> {
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: APP_URL, ...payload }),
        { TTL: 6 * 3600, urgency: 'normal' },
      );
      sent += 1;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // toestel bestaat niet meer
      else console.error('push mislukt', code, (e as Error).message);
    }
  }
  return sent;
}

/** Leg vast dat een melding verstuurd wordt; false als dat al eerder gebeurde (geen dubbele meldingen). */
async function claim(userId: string, kind: string, key: string): Promise<boolean> {
  const { error } = await db.from('notification_log').insert({ user_id: userId, kind, key });
  return !error;
}

// ---------- Weer in Breukelen ----------
async function weatherLine(): Promise<{ emoji: string; text: string }> {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${BREUKELEN.lat}&longitude=${BREUKELEN.lon}` +
      '&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe%2FAmsterdam&forecast_days=1';
    const d = await (await fetch(u)).json();
    const code: number = d.daily.weather_code[0];
    const t = Math.round(d.daily.temperature_2m_max[0]);
    const pick = (xs: string[]) => xs[new Date().getDate() % xs.length];
    if (code <= 1) return { emoji: '☀️', text: pick([`De zon schijnt vandaag in Breukelen (${t}°) en jij bent ook een zonnetje!`, `Zonnig en ${t}°: een stralende dag, net als jij ☀️`]) };
    if (code <= 3) return { emoji: '⛅', text: pick([`Een beetje zon, een beetje wolken (${t}°). Jij brengt vandaag de zon mee!`, `Wisselvallig, ${t}°. Jij bent het lichtpuntje vandaag ⛅`]) };
    if (code === 45 || code === 48) return { emoji: '🌫️', text: `Mistig begin (${t}°)… maar jij ziet je doelen haarscherp!` };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '❄️', text: `Sneeuw! (${t}°) Warm jezelf op met je doelen ❄️` };
    if (code >= 95) return { emoji: '⛈️', text: `Onweer buiten, rust binnen. Jij hebt het in handen! (${t}°)` };
    return { emoji: '🌧️', text: pick([`Regen vandaag (${t}°). Grijs buiten? Jij maakt het licht 💛`, `Natte dag (${t}°), perfect voor binnen-squats! 💪`]) };
  } catch {
    return { emoji: '🌞', text: 'Een nieuwe dag, een nieuwe kans. Jij kunt dit!' };
  }
}

// ---------- tick: alles wat op dit moment verstuurd moet worden ----------
async function tick() {
  const { date: today, minutes: now } = nowNL();
  const { data: subs } = await db.from('push_subscriptions').select('user_id');
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  if (!userIds.length) return { users: 0, sent: 0 };

  const [prefsQ, profilesQ, membersQ, habitsQ, checksQ, pausesQ] = await Promise.all([
    db.from('notification_prefs').select('*').in('user_id', userIds),
    db.from('profiles').select('id, display_name'),
    db.from('group_members').select('group_id, user_id'),
    db.from('habits').select('*').lte('start_date', today),
    db.from('habit_checks').select('habit_id, user_id, check_date, count, option').eq('check_date', today),
    db.from('pause_days').select('user_id, day').eq('day', today),
  ]);
  const prefsOf = (u: string): Prefs => ({ user_id: u, ...DEFAULT_PREFS, ...((prefsQ.data ?? []).find((p) => p.user_id === u) ?? {}) });
  const nameOf = (u: string) => (profilesQ.data ?? []).find((p) => p.id === u)?.display_name ?? 'Iemand';
  const members = membersQ.data ?? [];
  const habits = ((habitsQ.data ?? []) as Habit[]).filter((h) => !h.archived_on || h.archived_on > today);
  const checks = (checksQ.data ?? []) as Check[];
  const paused = new Set((pausesQ.data ?? []).map((p) => p.user_id as string));
  const checkOf = (h: Habit) => checks.find((c) => c.habit_id === h.id);
  const full = (h: Habit) => (checkOf(h)?.count ?? 0) >= Math.max(1, h.per_day ?? 1);
  const label = (h: Habit) => `${h.emoji} ${h.title}${h.per_day > 1 ? ` (${checkOf(h)?.count ?? 0}/${h.per_day})` : ''}`;

  // Reacties van de laatste 2 dagen (één keer ophalen)
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  const [cheersQ, kudosQ, commentsQ, actsQ] = await Promise.all([
    db.from('cheers').select('from_user, to_user, kind, created_at').gte('created_at', since),
    db.from('kudos').select('activity_id, user_id, created_at').gte('created_at', since),
    db.from('comments').select('activity_id, user_id, created_at').gte('created_at', since),
    db.from('activities').select('id, user_id').gte('created_at', new Date(Date.now() - 60 * 86400e3).toISOString()),
  ]);
  const ownerOf = (aid: string) => (actsQ.data ?? []).find((a) => a.id === aid)?.user_id;
  const CHEER = { highfive: '🙌', heart: '❤️', thinking: '🫶' } as Record<string, string>;

  let sent = 0;
  let weather: { emoji: string; text: string } | null = null;

  for (const u of userIds) {
    const p = prefsOf(u);
    const quiet = inQuiet(now, p.quiet_start, p.quiet_end);
    const mine = habits.filter((h) => h.user_id === u);
    const isPaused = paused.has(u);
    const name = nameOf(u);

    // 1. Ochtendboodschap
    if (p.morning && isDue(p.morning_time, now) && await claim(u, 'morning', today)) {
      weather ??= await weatherLine();
      const goals = isPaused ? 'Pauzedag vandaag, geniet ervan 🌙'
        : mine.length ? `Vandaag staan er ${mine.length} doelen voor je klaar. Je kunt het! 💪`
        : 'Kies vandaag een doel om mee te beginnen 🎯';
      sent += await sendTo(u, { title: `Goedemorgen ${name}! ${weather.emoji}`, body: `${weather.text} ${goals}`, tag: 'morning' });
    }

    // 2. Avondherinnering (alleen als er nog dagelijkse doelen open staan)
    const open = mine.filter((h) => h.per_week >= 7 && !full(h));
    if (p.evening && !isPaused && open.length && isDue(p.evening_time, now) && await claim(u, 'evening', today)) {
      sent += await sendTo(u, {
        title: open.length === 1 ? 'Nog 1 doel open 🌙' : `Nog ${open.length} doelen open 🌙`,
        body: `${open.map(label).join(', ')}. Je kunt het! 💪`, tag: 'evening',
      });
    }

    // 3. Herinneringen per doel
    if (p.habit_reminders && !isPaused) {
      for (const h of mine) {
        for (const t of h.reminder_times ?? []) {
          if (!isDue(t, now) || full(h) || !(await claim(u, 'habit', `${h.id}:${today}:${t}`))) continue;
          const c = checkOf(h)?.count ?? 0;
          const body = h.per_day > 1 ? `${c}/${h.per_day} vandaag. Even ${h.title.toLowerCase()} doen?`
            : h.options?.length ? `Kies er één: ${h.options.join(' / ')}`
            : 'Even afvinken als je het gedaan hebt ✓';
          sent += await sendTo(u, { title: `${h.emoji} Tijd voor ${h.title}!`, body, tag: `habit-${h.id}` });
        }
      }
    }

    if (quiet) continue; // groepsnieuws en reacties wachten tot na de stille uren

    // 4. Groepsnieuws: iemand heeft alles gedaan / een 🔥-doel gehaald
    const myGroups = members.filter((m) => m.user_id === u).map((m) => m.group_id);
    const mates = [...new Set(members.filter((m) => myGroups.includes(m.group_id) && m.user_id !== u).map((m) => m.user_id as string))];
    const news: string[] = [];
    for (const m of mates) {
      const theirs = habits.filter((h) => h.user_id === m);
      const daily = theirs.filter((h) => h.per_week >= 7);
      if (p.group_all_done && daily.length >= 2 && daily.every(full) && await claim(u, 'alldone', `${m}:${today}`)) {
        news.push(`${nameOf(m)} heeft vandaag alles afgevinkt! 🎉`);
      }
      if (p.group_hard_goal) {
        for (const h of theirs.filter((x) => x.difficulty === 'moeilijk' && full(x))) {
          if (await claim(u, 'hard', `${h.id}:${today}`)) {
            news.push(h.is_private ? `${nameOf(m)} haalde een 🔥-doel!` : `${nameOf(m)} haalde een 🔥-doel: ${h.emoji} ${h.title}`);
          }
        }
      }
    }
    if (news.length) {
      sent += await sendTo(u, { title: news.length === 1 ? 'Nieuws uit de groep ✨' : `${news.length}× nieuws uit de groep ✨`, body: news.join(' · '), tag: 'group' });
    }

    // 5. Reacties op jou (gebundeld)
    if (p.reactions) {
      const { data: wm } = await db.from('notify_watermarks').select('last_at').eq('user_id', u).eq('kind', 'reactions').maybeSingle();
      const last = wm?.last_at ?? new Date(Date.now() - 15 * 60e3).toISOString();
      const items = [
        ...(cheersQ.data ?? []).filter((c) => c.to_user === u && c.from_user !== u && c.created_at > last)
          .map((c) => ({ who: c.from_user as string, what: CHEER[c.kind as string] ?? '🙌', at: c.created_at as string })),
        ...(kudosQ.data ?? []).filter((k) => ownerOf(k.activity_id) === u && k.user_id !== u && k.created_at > last)
          .map((k) => ({ who: k.user_id as string, what: '👏', at: k.created_at as string })),
        ...(commentsQ.data ?? []).filter((c) => ownerOf(c.activity_id) === u && c.user_id !== u && c.created_at > last)
          .map((c) => ({ who: c.user_id as string, what: '💬', at: c.created_at as string })),
      ];
      if (items.length) {
        const who = [...new Set(items.map((i) => nameOf(i.who)))];
        const body = items.length === 1
          ? `${who[0]} gaf je een ${items[0].what}${items[0].what === '💬' ? ' (reactie op je training)' : ''}`
          : `Je kreeg ${items.length} reacties (${items.map((i) => i.what).join(' ')}) van ${who.join(', ')}`;
        sent += await sendTo(u, { title: 'Iemand denkt aan je 💕', body, tag: 'reactions' });
      }
      const newest = items.reduce((a, i) => (i.at > a ? i.at : a), last);
      await db.from('notify_watermarks').upsert({ user_id: u, kind: 'reactions', last_at: items.length ? newest : (wm?.last_at ?? new Date().toISOString()) });
    }
  }
  return { users: userIds.length, sent, time: `${today} ${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}` };
}

// ---------- Ingelogde gebruiker uit de Authorization-header ----------
async function userFrom(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* leeg */ }
  const action = String(body.action ?? '');
  const cronOk = req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');

  try {
    if (action === 'tick') {
      if (!cronOk) return json({ error: 'niet toegestaan' }, 401);
      return json(await tick());
    }
    if (action === 'selftest') {
      if (!cronOk) return json({ error: 'niet toegestaan' }, 401);
      // Versleutelen + ondertekenen testen zonder iets te versturen
      const keys = webpush.generateVAPIDKeys();
      const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
      const r = webpush.generateRequestDetails(fake, 'hallo', { vapidDetails: { subject: APP_URL, publicKey: keys.publicKey, privateKey: keys.privateKey } });
      return json({ ok: true, headers: Object.keys(r.headers), bodyBytes: r.body?.length ?? 0, now: nowNL(), weather: await weatherLine() });
    }

    const user = await userFrom(req);
    if (!user) return json({ error: 'log eerst in' }, 401);

    if (action === 'test') {
      const sent = await sendTo(user.id, { title: 'Test 🔔', body: 'Meldingen werken! Zo zie je ze voortaan 💪', tag: 'test' });
      return json({ sent });
    }

    if (action === 'broadcast') {
      const groupId = String(body.group_id ?? '');
      const message = String(body.message ?? '').trim().slice(0, 200);
      if (!message) return json({ error: 'leeg bericht' }, 400);
      const { data: me } = await db.from('group_members').select('role').eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
      if (me?.role !== 'admin') return json({ error: 'alleen beheerders' }, 403);
      const [{ data: group }, { data: mem }, { data: prof }] = await Promise.all([
        db.from('groups').select('name').eq('id', groupId).single(),
        db.from('group_members').select('user_id').eq('group_id', groupId),
        db.from('profiles').select('display_name').eq('id', user.id).single(),
      ]);
      const targets = (mem ?? []).map((m) => m.user_id as string).filter((id) => id !== user.id);
      const { data: prefs } = await db.from('notification_prefs').select('user_id, broadcasts').in('user_id', targets);
      let sent = 0;
      for (const t of targets) {
        if (prefs?.find((p) => p.user_id === t)?.broadcasts === false) continue;
        sent += await sendTo(t, { title: `📣 ${group?.name ?? 'LockedIn'}`, body: `${prof?.display_name ?? 'Beheerder'}: ${message}`, tag: `broadcast-${Date.now()}` });
      }
      return json({ sent, members: targets.length });
    }
    return json({ error: 'onbekende actie' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
