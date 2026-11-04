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
                  <Line k="Trouw aan je doelen" v={s.weekPts} />
                  <Line k={`Perfecte weken (${s.perfectWeeks}×)`} v={s.perfectBonus} />
                  <Line k="Groepsbonus" v={s.groupBonus} />
                  <div className="weeks">
                    {s.weeks.map((w) => {
                      const met = w.goals.filter((g) => g.met).length;
                      return (
                        <span key={w.week.start} className={'wk' + (w.perfect ? ' met' : w.week.status === 'current' ? ' cur' : '')}
                          title={`Week van ${shortDate(w.week.start)}: ${met}/${w.goals.length} doelen gehaald, ${w.pts + w.bonus} punten`}>
                          {w.perfect ? '⭐' : ''}{Math.round(w.pct * 100)}%
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
          <li>Het gaat om <b>hoe trouw je bent aan je eigen doelen</b>, niet om hoeveel doelen je hebt.</li>
          <li>Per week verdien je max. <b>{RULES.week}</b> punten (± 10 per dag): het percentage van je doelen dat je haalt. Een dagdoel 5 van de 7 keer = 71%, een doel van 3× per week 3 van de 3 keer = 100%. Daarvan het gemiddelde.</li>
          <li>Moeilijkheid telt mee: 🌱 makkelijk weegt ½, 💪 gemiddeld 1 en 🔥 moeilijk 1½. Een moeilijk doel laten liggen kost dus meer. Je maximum blijft hetzelfde.</li>
          <li>Voor volle punten heb je minstens {RULES.minGoals} "doelpunten" nodig, bijvoorbeeld 3 gemiddelde doelen, 2 moeilijke of 6 makkelijke. Met minder verdien je naar verhouding minder.</li>
          <li><b>+{RULES.perfectWeek}</b> voor een perfecte week: al je doelen gehaald ⭐</li>
          <li><b>+{RULES.group}</b> voor iedereen als de héle groep een perfecte week heeft</li>
          <li>Trainen telt mee als één doel (je trainingsdoel per week).</li>
          <li>Pauzedagen verlagen je weekdoelen naar verhouding. Korte weken aan het begin en eind tellen naar verhouding.</li>
          <li>Tip: kies doelen die je nu nog <i>niet</i> vanzelf doet. 💪</li>
        </ul>
      </details>
    </div>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return <div className="bline"><span>{k}</span><b>{v}</b></div>;
}
