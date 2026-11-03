import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { computeScores } from '../points';
import { daysBetween, shortDate, today } from '../dates';
import HabitList from '../components/HabitList';
import MoodCheckin from '../components/MoodCheckin';
import GroupDay from '../components/GroupDay';
import ActivityCard from '../components/ActivityCard';
import type { Tab } from './Shell';

const PAGE = 10;

function greeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
}

export default function Today({ go }: { go: (t: Tab) => void }) {
  const { me, data, currentChallenge: c } = useStore();
  const [limit, setLimit] = useState(PAGE);
  const t = today();

  const myScore = useMemo(() => c ? computeScores({
    challenge: c, memberIds: data.members.map((m) => m.user_id), activities: data.activities,
    goals: data.goals, habits: data.habits, checks: data.checks, pauses: data.pauses,
  }).find((s) => s.userId === me.id) : undefined, [c, data, me.id]);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <div className="muted small">{data.group.name}</div>
          <h1>{greeting()}, {me.display_name}</h1>
        </div>
        {myScore && (
          <button className="pts-pill" onClick={() => go('ranking')} title="Naar de ranglijst">
            <b>{myScore.total}</b><span>punten</span>
          </button>
        )}
      </header>

      {c && (
        <div className="challenge-strip">
          <span><b>{c.name}</b></span>
          <span className="muted">
            {t < c.start_date ? `start over ${daysBetween(t, c.start_date)} d`
              : t > c.end_date ? 'afgelopen'
              : `nog ${daysBetween(t, c.end_date)} dagen · t/m ${shortDate(c.end_date)}`}
          </span>
        </div>
      )}

      <MoodCheckin />

      <HabitList onAddGoal={() => go('goals')} onAddTraining={() => go('add')} />

      <GroupDay day={t} title="De groep vandaag" />

      {data.members.length < 2 && (
        <div className="card empty">
          <p>Samen hou je het langer vol. Nodig je vrienden uit! 💌</p>
          <button className="btn ghost" onClick={() => go('group')}>Uitnodigen</button>
        </div>
      )}

      {data.activities.length > 0 && (
        <>
          <h2 className="section-title">Trainingen</h2>
          {data.activities.slice(0, limit).map((a) => <ActivityCard key={a.id} a={a} />)}
          {data.activities.length > limit && (
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>Meer laden</button>
          )}
        </>
      )}
    </div>
  );
}
