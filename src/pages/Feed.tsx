import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { computeScores, RULES } from '../points';
import { daysBetween, shortDate, today } from '../dates';
import ActivityCard from '../components/ActivityCard';
import GoalEditor from '../components/GoalEditor';
import type { Tab } from './Shell';

const PAGE = 20;

export default function Feed({ go }: { go: (t: Tab) => void }) {
  const { me, data, currentChallenge: c } = useStore();
  const [limit, setLimit] = useState(PAGE);

  const scores = useMemo(
    () => (c ? computeScores(c, data.members.map((m) => m.user_id), data.activities, data.goals) : []),
    [c, data],
  );
  const mine = scores.find((s) => s.userId === me.id);
  const tw = mine?.thisWeek;
  const groupDone = scores.filter((s) => s.thisWeek?.met).length;
  const t = today();

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <div className="muted small">{data.group.name}</div>
          <h1>Hoi {me.display_name}</h1>
        </div>
      </header>

      {c && (
        <section className="card hero">
          <div className="hero-top">
            <div>
              <div className="muted small">{c.name}</div>
              <div className="small">
                {t < c.start_date ? `Start over ${daysBetween(t, c.start_date)} dagen`
                  : t > c.end_date ? 'Afgelopen'
                  : `Nog ${daysBetween(t, c.end_date)} dagen · t/m ${shortDate(c.end_date)}`}
              </div>
            </div>
            {mine && <div className="big-pts">{mine.total}<span>punten</span></div>}
          </div>

          {mine && !mine.goalSet && t <= c.end_date && (
            <div className="notice">
              <b>Stel je weekdoel in.</b> Hoeveel keer per week ga je trainen?
              <GoalEditor challenge={c} />
            </div>
          )}

          {tw && (
            <>
              <div className="progress-label">
                <span>Deze week</span>
                <b>{tw.sessions} / {tw.required} {tw.met ? '✅' : ''}</b>
              </div>
              <div className="bar"><div style={{ width: `${Math.min(100, (tw.sessions / tw.required) * 100)}%` }} /></div>
              <div className="muted small">
                {tw.met
                  ? `Weekdoel gehaald! +${RULES.weekGoal}${mine.streak > 1 ? ` · 🔥 ${mine.streak} weken op rij` : ''}`
                  : `Nog ${tw.required - tw.sessions} te gaan voor +${RULES.weekGoal} bonus`}
              </div>
              <div className="group-dots">
                {scores.map((s) => (
                  <span key={s.userId} className={'dot' + (s.thisWeek?.met ? ' on' : '')}
                    style={{ borderColor: data.profiles[s.userId]?.color }}
                    title={data.profiles[s.userId]?.display_name}>
                    {data.profiles[s.userId]?.display_name.charAt(0)}
                  </span>
                ))}
                <span className="muted small">
                  {groupDone}/{scores.length} klaar{groupDone === scores.length && scores.length > 1 ? ` · groepsbonus +${RULES.group} 🎉` : ''}
                </span>
              </div>
            </>
          )}
          <button className="btn" onClick={() => go('add')}>＋ Training toevoegen</button>
        </section>
      )}

      {data.activities.length === 0 ? (
        <div className="card empty">
          <p>Nog geen trainingen. Wie zet de eerste neer? 🏁</p>
          {data.members.length < 2 && (
            <button className="btn ghost" onClick={() => go('group')}>Nodig je vrienden uit</button>
          )}
        </div>
      ) : (
        <>
          {data.activities.slice(0, limit).map((a) => <ActivityCard key={a.id} a={a} />)}
          {data.activities.length > limit && (
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>Meer laden</button>
          )}
        </>
      )}
    </div>
  );
}
