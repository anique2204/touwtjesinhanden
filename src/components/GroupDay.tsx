import { useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { daysBetween, today } from '../dates';
import { activeStreak, dayStatus, habitActiveOn } from '../points';
import { CHEER_KINDS, SPORTS, type CheerKind } from '../types';
import Avatar from './Avatar';
import MoodIcon from './MoodIcon';

/** Hoe staat iedereen ervoor op een dag, met reacties. Gebruikt op Vandaag en in de kalender. */
export default function GroupDay({ day, title }: { day: string; title?: string }) {
  const { me, data, patch } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const canReact = daysBetween(day, today()) <= 7 && day <= today();

  const people = data.members
    .map((m) => ({ id: m.user_id, p: data.profiles[m.user_id], st: dayStatus(m.user_id, day, data.habits, data.checks, data.activities, data.pauses) }))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : (b.st.done + b.st.trainings) - (a.st.done + a.st.trainings)));

  async function react(to: string, kind: CheerKind) {
    const key = `${to}-${kind}`;
    if (busy) return;
    const same = (c: { from_user: string; to_user: string; day: string; kind: string }) =>
      c.from_user === me.id && c.to_user === to && c.day === day && c.kind === kind;
    const mine = data.cheers.some(same);
    setBusy(key);
    const row = { group_id: data.group.id, from_user: me.id, to_user: to, day, kind };
    patch((d) => ({ ...d, cheers: mine ? d.cheers.filter((c) => !same(c)) : [...d.cheers, row] }));
    const { error } = mine
      ? await supabase.from('cheers').delete().eq('to_user', to).eq('day', day).eq('from_user', me.id).eq('kind', kind)
      : await supabase.from('cheers').insert(row);
    if (error) {
      patch((d) => ({ ...d, cheers: mine ? [...d.cheers, row] : d.cheers.filter((c) => !same(c)) }));
      alert(errMsg(error));
    }
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
          const streak = activeStreak(id, data.checks, data.activities, data.pauses);
          const mood = id === me.id
            ? data.myMoods.find((m) => m.day === day)
            : data.sharedMoods.find((m) => m.user_id === id && m.day === day);
          return (
            <li key={id} className="person">
              <div className="person-top">
                <span className="avatar-wrap">
                  <Avatar p={p} />
                  {mood && <span className="mood-badge" title="Mood"><MoodIcon score={mood.score} /></span>}
                </span>
                <div className="grow">
                  <div className="name">{p?.display_name}{id === me.id && <span className="muted"> (jij)</span>}</div>
                  <div className="muted small">
                    {st.paused && '🌙 pauzedag · '}
                    {st.total > 0 ? `${st.done}/${st.total} doelen` : st.paused ? '' : habits.length ? 'Weekdoelen al binnen' : 'Nog geen doelen'}
                    {trainings.length > 0 && ` · ${trainings.length}× getraind`}
                    {streak > 1 && ` · 🔥 ${streak}`}
                  </div>
                </div>
                {st.level === 'all' && <span className="badge good-badge">Alles ✓</span>}
              </div>

              {(habits.length > 0 || trainings.length > 0) && (
                <div className="chips-row">
                  {habits.map((h) => (
                    <span key={h.id} className={'hchip' + (checked.has(h.id) ? ' on' : '')} title={h.title ?? 'Privé doel'}>
                      {h.emoji}<span className="hchip-t">{h.title ?? 'privé'}</span>
                    </span>
                  ))}
                  {trainings.map((a) => (
                    <span key={a.id} className="hchip on">{SPORTS[a.sport].emoji}<span className="hchip-t">{a.label || SPORTS[a.sport].label}</span></span>
                  ))}
                </div>
              )}

              {(id !== me.id && canReact) || got.length > 0 ? (
                <div className="reactions">
                  {CHEER_KINDS.map((k) => {
                    const ofKind = got.filter((c) => c.kind === k.id);
                    const gaveMine = ofKind.some((c) => c.from_user === me.id);
                    const names = ofKind.map((c) => data.profiles[c.from_user]?.display_name).filter(Boolean).join(', ');
                    if (id === me.id || !canReact) {
                      return ofKind.length > 0 ? (
                        <span key={k.id} className="react static" title={`${k.label}: ${names}`}>{k.emoji}<b>{ofKind.length}</b></span>
                      ) : null;
                    }
                    return (
                      <button key={k.id} className={'react' + (gaveMine ? ' on' : '')} disabled={busy === `${id}-${k.id}`}
                        onClick={() => react(id, k.id)} title={names ? `${k.label}: ${names}` : k.label}>
                        {k.emoji}{ofKind.length > 0 && <b>{ofKind.length}</b>}
                      </button>
                    );
                  })}
                  {id === me.id && got.length > 0 && (
                    <span className="muted small">van {[...new Set(got.map((c) => data.profiles[c.from_user]?.display_name))].join(', ')}</span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
