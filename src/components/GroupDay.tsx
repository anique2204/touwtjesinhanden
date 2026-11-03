import { useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { daysBetween, today } from '../dates';
import { activeStreak, dayStatus, habitActiveOn } from '../points';
import { SPORTS } from '../types';
import Avatar from './Avatar';

/** Hoe staat iedereen ervoor op een dag, met high fives. Gebruikt op Vandaag en in de kalender. */
export default function GroupDay({ day, title }: { day: string; title?: string }) {
  const { me, data, patch } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const canCheer = daysBetween(day, today()) <= 7 && day <= today();

  const people = data.members
    .map((m) => ({ id: m.user_id, p: data.profiles[m.user_id], st: dayStatus(m.user_id, day, data.habits, data.checks, data.activities) }))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : (b.st.done + b.st.trainings) - (a.st.done + a.st.trainings)));

  async function cheer(to: string) {
    if (busy) return;
    const mine = data.cheers.some((c) => c.from_user === me.id && c.to_user === to && c.day === day);
    setBusy(to);
    const row = { group_id: data.group.id, from_user: me.id, to_user: to, day };
    patch((d) => ({ ...d, cheers: mine ? d.cheers.filter((c) => !(c.from_user === me.id && c.to_user === to && c.day === day)) : [...d.cheers, row] }));
    const { error } = mine
      ? await supabase.from('cheers').delete().eq('to_user', to).eq('day', day).eq('from_user', me.id)
      : await supabase.from('cheers').insert(row);
    if (error) alert(errMsg(error));
    setBusy(null);
  }

  return (
    <section className="card stack">
      {title && <h2>{title}</h2>}
      <ul className="people">
        {people.map(({ id, p, st }) => {
          const habits = data.habits.filter((h) => h.user_id === id && habitActiveOn(h, day));
          const checked = new Set(data.checks.filter((x) => x.user_id === id && x.check_date === day).map((x) => x.habit_id));
          const trainings = data.activities.filter((a) => a.user_id === id && a.activity_date === day);
          const got = data.cheers.filter((c) => c.to_user === id && c.day === day);
          const gaveMine = got.some((c) => c.from_user === me.id);
          const streak = activeStreak(id, data.checks, data.activities);
          return (
            <li key={id} className="person">
              <div className="person-top">
                <Avatar p={p} />
                <div className="grow">
                  <div className="name">{p?.display_name}{id === me.id && <span className="muted"> (jij)</span>}</div>
                  <div className="muted small">
                    {st.total > 0 ? `${st.done}/${st.total} doelen` : habits.length ? 'Weekdoelen al binnen' : 'Nog geen doelen'}
                    {trainings.length > 0 && ` · ${trainings.length}× getraind`}
                    {streak > 1 && ` · 🔥 ${streak}`}
                  </div>
                </div>
                {st.level === 'all' && <span className="badge good-badge">Alles ✓</span>}
                {id !== me.id && canCheer ? (
                  <button className={'cheer' + (gaveMine ? ' on' : '')} disabled={busy === id} onClick={() => cheer(id)}
                    title="Geef een high five">🙌{got.length > 0 && <b>{got.length}</b>}</button>
                ) : got.length > 0 ? (
                  <span className="cheer static" title={got.map((c) => data.profiles[c.from_user]?.display_name).join(', ')}>🙌<b>{got.length}</b></span>
                ) : null}
              </div>
              {(habits.length > 0 || trainings.length > 0) && (
                <div className="chips-row">
                  {habits.map((h) => (
                    <span key={h.id} className={'hchip' + (checked.has(h.id) ? ' on' : '')} title={h.title ?? 'Privé doel'}>
                      {h.emoji}{h.title ? <span className="hchip-t">{h.title}</span> : <span className="hchip-t">privé</span>}
                    </span>
                  ))}
                  {trainings.map((a) => (
                    <span key={a.id} className="hchip on">{SPORTS[a.sport].emoji}<span className="hchip-t">{a.label || SPORTS[a.sport].label}</span></span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
