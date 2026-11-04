import { useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import type { Habit } from '../types';
import { addDays, mondayOf, relativeDay, today } from '../dates';
import { dayStatus, habitActiveOn, habitStreak, pauseSet, required } from '../points';

const CHEERS_ALL = ['Alles gedaan, wat goed! 🎉', 'Topdag! Alles afgevinkt 🌟', 'Je hebt het helemaal in handen 💪', 'Yes! Alles binnen 🙌'];

export default function HabitList({ onAddGoal, onAddTraining }: { onAddGoal: () => void; onAddTraining: () => void }) {
  const { me, data, patch, currentChallenge } = useStore();
  const [day, setDay] = useState(today());
  const [busy, setBusy] = useState<string | null>(null);

  const mine = data.habits.filter((h) => h.user_id === me.id && habitActiveOn(h, day));
  const myChecks = data.checks.filter((x) => x.user_id === me.id);
  const isChecked = (h: Habit) => myChecks.some((x) => x.habit_id === h.id && x.check_date === day);
  const status = dayStatus(me.id, day, data.habits, data.checks, data.activities, data.pauses);
  const mon = mondayOf(day), sun = addDays(mon, 6);

  const tg = currentChallenge && data.goals.find((g) => g.user_id === me.id && g.challenge_id === currentChallenge.id);
  const trainingsThisWeek = data.activities.filter((a) => a.user_id === me.id && a.activity_date >= mon && a.activity_date <= sun).length;

  async function toggle(h: Habit) {
    if (busy) return;
    const was = isChecked(h);
    setBusy(h.id);
    const row = { habit_id: h.id, group_id: data.group.id, user_id: me.id, check_date: day };
    patch((d) => ({
      ...d,
      checks: was
        ? d.checks.filter((x) => !(x.habit_id === h.id && x.check_date === day))
        : [...d.checks, row],
    }));
    const { error } = was
      ? await supabase.from('habit_checks').delete().eq('habit_id', h.id).eq('check_date', day)
      : await supabase.from('habit_checks').insert(row);
    if (error) {
      patch((d) => ({ ...d, checks: was ? [...d.checks, row] : d.checks.filter((x) => !(x.habit_id === h.id && x.check_date === day)) }));
      alert(errMsg(error));
    }
    setBusy(null);
  }

  const days = [0, -1, -2].map((n) => addDays(today(), n));
  const paused = data.pauses.some((p) => p.user_id === me.id && p.day === day);
  const pausesThisWeek = data.pauses.filter((p) => p.user_id === me.id && p.day >= mon && p.day <= sun).length;

  async function togglePause() {
    if (paused) {
      if (!confirm('Pauzedag opheffen?')) return;
    } else if (!confirm(`${relativeDay(day)} als pauzedag nemen? 🌙\n\nJe streaks breken niet en je weekdoelen worden naar verhouding lager. De groep ziet alleen "pauzedag", niet waarom. Max. 2 per week.`)) return;
    const row = { user_id: me.id, group_id: data.group.id, day };
    patch((d) => ({ ...d, pauses: paused ? d.pauses.filter((p) => !(p.user_id === me.id && p.day === day)) : [...d.pauses, row] }));
    const { error } = paused
      ? await supabase.from('pause_days').delete().eq('user_id', me.id).eq('day', day)
      : await supabase.from('pause_days').insert(row);
    if (error) {
      patch((d) => ({ ...d, pauses: paused ? [...d.pauses, row] : d.pauses.filter((p) => !(p.user_id === me.id && p.day === day)) }));
      alert(errMsg(error));
    }
  }
  const allDone = status.total > 0 && status.done === status.total;

  return (
    <section className="card stack">
      <div className="hl-head">
        <h2>Mijn doelen</h2>
        <div className="segmented mini">
          {days.map((d) => (
            <button key={d} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>{relativeDay(d)}</button>
          ))}
        </div>
      </div>

      {mine.length === 0 && !tg ? (
        <div className="empty-goals">
          <p>Wat wil jij volhouden? Kies een paar kleine doelen, zoals water drinken, op tijd slapen of wandelen.</p>
          <button className="btn" onClick={onAddGoal}>🎯 Kies je eerste doel</button>
        </div>
      ) : (
        <>
          {paused && (
            <div className="pause-banner">
              <span>🌙</span>
              <div className="grow"><b>Pauzedag</b><div className="small">Je streaks zijn veilig. Rust lekker uit, afvinken mag nog steeds 💜</div></div>
            </div>
          )}
          {status.total > 0 && (
            <div className={'day-progress' + (allDone ? ' done' : '')}>
              <div className="bar"><div style={{ width: `${(status.done / status.total) * 100}%` }} /></div>
              <span>{allDone ? CHEERS_ALL[new Date(day).getDate() % CHEERS_ALL.length] : `${status.done} van ${status.total} gedaan`}</span>
            </div>
          )}

          <ul className="habits">
            {mine.map((h) => {
              const on = isChecked(h);
              const st = habitStreak(h, data.checks, pauseSet(data.pauses, me.id));
              const weekDone = myChecks.filter((x) => x.habit_id === h.id && x.check_date >= mon && x.check_date <= sun).length;
              return (
                <li key={h.id} className={'habit' + (on ? ' on' : '')}>
                  <button className="habit-main" onClick={() => toggle(h)} disabled={busy === h.id}>
                    <span className="h-emoji">{h.emoji}</span>
                    <span className="grow left">
                      <span className="h-title">{h.title} {h.is_private && <span className="lock" title="Privé">🔒</span>}</span>
                      <span className="muted small">
                        {h.per_week >= 7 ? 'Elke dag' : `${weekDone}/${required(h.per_week, 7)} deze week`}
                        {st.n > 0 && ` · 🔥 ${st.n} ${st.unit === 'dag' ? (st.n === 1 ? 'dag' : 'dagen') : st.n === 1 ? 'week' : 'weken'}`}
                      </span>
                    </span>
                    <span className="h-check" aria-label={on ? 'Gedaan' : 'Nog niet gedaan'}>{on ? '✓' : ''}</span>
                  </button>
                </li>
              );
            })}
            {tg && (
              <li className={'habit' + (trainingsThisWeek >= tg.sessions_per_week ? ' on' : '')}>
                <button className="habit-main" onClick={onAddTraining}>
                  <span className="h-emoji">💪</span>
                  <span className="grow left">
                    <span className="h-title">Trainen</span>
                    <span className="muted small">{trainingsThisWeek}/{tg.sessions_per_week} deze week · tik om een training toe te voegen</span>
                  </span>
                  <span className="h-check plus">{trainingsThisWeek >= tg.sessions_per_week ? '✓' : '+'}</span>
                </button>
              </li>
            )}
          </ul>
          <div className="hl-foot">
            <span className="muted small">Punten = hoe trouw je bent aan je doelen</span>
            <span className="hl-actions">
              <button className="link small" disabled={!paused && pausesThisWeek >= 2} onClick={togglePause}
                title={!paused && pausesThisWeek >= 2 ? 'Max. 2 pauzedagen per week' : ''}>
                {paused ? 'Pauze opheffen' : '🌙 Pauzedag'}
              </button>
              <button className="link small" onClick={onAddGoal}>Doelen beheren</button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
