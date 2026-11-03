import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { activeStreak, computeScores, RULES } from '../points';
import { shortDate } from '../dates';
import Avatar from '../components/Avatar';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Ranking() {
  const { me, data, currentChallenge } = useStore();
  const [cid, setCid] = useState(currentChallenge?.id ?? data.challenges[0]?.id);
  const [open, setOpen] = useState<string | null>(null);
  const c = data.challenges.find((x) => x.id === cid) ?? currentChallenge;

  const scores = useMemo(() => (c ? computeScores({
    challenge: c, memberIds: data.members.map((m) => m.user_id), activities: data.activities,
    goals: data.goals, habits: data.habits, checks: data.checks, pauses: data.pauses,
  }) : []), [c, data]);

  if (!c) return <div className="card empty">Er is nog geen challenge.</div>;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Ranglijst</h1>
        {data.challenges.length > 1 && (
          <select value={c.id} onChange={(e) => setCid(e.target.value)}>
            {data.challenges.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </header>
      <p className="muted small">{c.name} · {shortDate(c.start_date)} – {shortDate(c.end_date)}</p>

      <div className="card list">
        {scores.map((s, i) => {
          const p = data.profiles[s.userId];
          const isOpen = open === s.userId;
          const streak = activeStreak(s.userId, data.checks, data.activities, data.pauses);
          const tw = s.thisWeek;
          const twMet = tw ? tw.goals.filter((g) => g.met).length : 0;
          return (
            <div key={s.userId} className={'rank-row' + (s.userId === me.id ? ' me' : '')}>
              <button className="rank-main" onClick={() => setOpen(isOpen ? null : s.userId)}>
                <span className="pos">{MEDALS[i] ?? i + 1}</span>
                <Avatar p={p} />
                <div className="grow left">
                  <div className="name">{p?.display_name}</div>
                  <div className="muted small">
                    {s.checks} vinkjes · {s.sessions} {s.sessions === 1 ? 'training' : 'trainingen'}
                    {streak > 1 && ` · 🔥${streak}`}
                  </div>
                </div>
                <div className="total">{s.total}</div>
              </button>
              {tw && tw.goals.length > 0 && (
                <div className="mini-bar" title={`Deze week ${twMet}/${tw.goals.length} doelen gehaald`}>
                  <div style={{ width: `${(twMet / tw.goals.length) * 100}%`, background: p?.color }} />
                </div>
              )}
              {isOpen && (
                <div className="breakdown">
                  <Line k={`Vinkjes (${s.checks}×)`} v={s.checkPts} />
                  <Line k={`Trainingen (${s.sessions}×)`} v={s.trainingPts} />
                  <Line k={`Weekdoelen gehaald (${s.goalsMet}×)`} v={s.goalBonus} />
                  <Line k={`Perfecte weken (${s.perfectWeeks}×)`} v={s.perfectBonus} />
                  <Line k="Groepsbonus" v={s.groupBonus} />
                  <div className="weeks">
                    {s.weeks.map((w) => {
                      const met = w.goals.filter((g) => g.met).length;
                      return (
                        <span key={w.week.start} className={'wk' + (w.perfect ? ' met' : w.week.status === 'current' ? ' cur' : '')}
                          title={`Week van ${shortDate(w.week.start)}: ${met}/${w.goals.length} doelen`}>
                          {w.perfect ? '⭐' : `${met}/${w.goals.length}`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details className="card rules">
        <summary>Hoe werken de punten?</summary>
        <ul>
          <li><b>+{RULES.check}</b> voor elk afgevinkt doel</li>
          <li><b>+{RULES.training}</b> voor elke training, net als elk ander doel</li>
          <li><b>+{RULES.goalWeek}</b> per doel dat je in een week haalt (week = ma t/m zo)</li>
          <li><b>+{RULES.perfectWeek}</b> voor een perfecte week: al je doelen gehaald ⭐</li>
          <li><b>+{RULES.group}</b> voor iedereen als de héle groep een perfecte week heeft</li>
          <li>Begin je halverwege de week met een doel, dan telt die week naar verhouding</li>
        </ul>
      </details>
    </div>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return <div className="bline"><span>{k}</span><b>{v}</b></div>;
}
