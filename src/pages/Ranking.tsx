import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { computeScores, RULES } from '../points';
import { formatDuration, shortDate } from '../dates';
import Avatar from '../components/Avatar';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Ranking() {
  const { me, data, currentChallenge } = useStore();
  const [cid, setCid] = useState(currentChallenge?.id ?? data.challenges[0]?.id);
  const [open, setOpen] = useState<string | null>(null);
  const c = data.challenges.find((x) => x.id === cid) ?? currentChallenge;

  const scores = useMemo(
    () => (c ? computeScores(c, data.members.map((m) => m.user_id), data.activities, data.goals) : []),
    [c, data],
  );

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
          return (
            <div key={s.userId} className={'rank-row' + (s.userId === me.id ? ' me' : '')}>
              <button className="rank-main" onClick={() => setOpen(isOpen ? null : s.userId)}>
                <span className="pos">{MEDALS[i] ?? i + 1}</span>
                <Avatar p={p} />
                <div className="grow left">
                  <div className="name">{p?.display_name}</div>
                  <div className="muted small">
                    {s.sessions} {s.sessions === 1 ? 'training' : 'trainingen'} · {formatDuration(s.minutes)}
                    {s.streak > 1 && ` · 🔥${s.streak}`}
                  </div>
                </div>
                <div className="total">{s.total}</div>
              </button>
              {s.thisWeek && (
                <div className="mini-bar" title="Deze week">
                  <div style={{ width: `${Math.min(100, (s.thisWeek.sessions / s.thisWeek.required) * 100)}%`, background: p?.color }} />
                </div>
              )}
              {isOpen && (
                <div className="breakdown">
                  <Line k={`Minuten (${s.minutes})`} v={s.base} />
                  <Line k={`Weekdoel gehaald (${s.weeks.filter((w) => w.met).length}×)`} v={s.goalBonus} />
                  <Line k="Streakbonus" v={s.streakBonus} />
                  <Line k={`Persoonlijke records (${s.prs}×)`} v={s.prBonus} />
                  <Line k="Groepsbonus" v={s.groupBonus} />
                  <div className="weeks">
                    {s.weeks.map((w) => (
                      <span key={w.week.start} className={'wk' + (w.met ? ' met' : w.week.status === 'current' ? ' cur' : ' miss')}
                        title={`${shortDate(w.week.start)}: ${w.sessions}/${w.required}`}>
                        {w.sessions}/{w.required}
                      </span>
                    ))}
                  </div>
                  <div className="muted small">Weekdoel: {s.goal}× per week{!s.goalSet && ' (standaard, nog niet ingesteld)'}{s.km > 0 && ` · ${s.km.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details className="card rules">
        <summary>Hoe werken de punten?</summary>
        <ul>
          <li><b>{RULES.perMinute} punt</b> per minuut training, elke sport telt</li>
          <li><b>+{RULES.weekGoal}</b> als je je eigen weekdoel haalt (week = ma t/m zo)</li>
          <li><b>+{RULES.streakPerWeek}</b> extra per week op rij dat je je doel haalt (max +{RULES.streakCap} per week)</li>
          <li><b>+{RULES.pr}</b> voor een persoonlijk record</li>
          <li><b>+{RULES.group}</b> voor iedereen als de héle groep die week zijn doel haalt</li>
          <li>Korte weken aan begin/eind tellen naar verhouding (bijv. 4× per week → 1× in een week van 1 dag)</li>
        </ul>
      </details>
    </div>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return <div className="bline"><span>{k}</span><b>{v}</b></div>;
}
