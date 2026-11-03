import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { addDays, fromISO, mondayOf, relativeDay, toISO, today } from '../dates';
import { dayStatus } from '../points';
import GroupDay from '../components/GroupDay';

const WD = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const monthName = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

export default function Calendar() {
  const { data } = useStore();
  const t = today();
  const [month, setMonth] = useState(() => t.slice(0, 7)); // 'YYYY-MM'
  const [sel, setSel] = useState(t);

  const first = `${month}-01`;
  const nextMonth = toISO(new Date(fromISO(first).getFullYear(), fromISO(first).getMonth() + 1, 1));
  const prevMonth = toISO(new Date(fromISO(first).getFullYear(), fromISO(first).getMonth() - 1, 1));
  const last = addDays(nextMonth, -1);

  const cells = useMemo(() => {
    const out: string[] = [];
    let d = mondayOf(first);
    while (d <= last || out.length % 7 !== 0) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [first, last]);

  const people = data.members.map((m) => ({ id: m.user_id, p: data.profiles[m.user_id] }));

  const stats = useMemo(() => {
    const map: Record<string, { id: string; color: string; level: 'none' | 'some' | 'all' | 'pause' }[]> = {};
    for (const d of cells) {
      if (d > t) continue;
      map[d] = people.map(({ id, p }) => ({
        id, color: p?.color ?? '#999', level: dayStatus(id, d, data.habits, data.checks, data.activities, data.pauses).level,
      }));
    }
    return map;
  }, [cells, people, data, t]);

  return (
    <div className="stack">
      <header className="page-head"><h1>Kalender</h1></header>

      <div className="card cal">
        <div className="cal-nav">
          <button className="round" onClick={() => setMonth(prevMonth.slice(0, 7))} aria-label="Vorige maand">‹</button>
          <b className="cal-title">{monthName.format(fromISO(first))}</b>
          <button className="round" onClick={() => setMonth(nextMonth.slice(0, 7))} aria-label="Volgende maand">›</button>
        </div>
        <div className="cal-grid">
          {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
          {cells.map((d) => {
            const inMonth = d.slice(0, 7) === month;
            const st = stats[d];
            const allGroup = st && st.length > 1 && st.every((x) => x.level === 'all');
            return (
              <button key={d} disabled={d > t}
                className={'cal-day' + (inMonth ? '' : ' out') + (d === t ? ' today' : '') + (d === sel ? ' sel' : '') + (allGroup ? ' star' : '')}
                onClick={() => setSel(d)}>
                <span className="cal-n">{fromISO(d).getDate()}</span>
                <span className="cal-dots">
                  {st?.filter((x) => x.level !== 'none').map((x) => (
                    <i key={x.id} className={x.level} style={{ background: x.level === 'all' ? x.color : 'transparent', borderColor: x.color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted small">
          <span><i className="all" /> alles gedaan</span>
          <span><i className="some" /> deels / getraind</span>
          <span><i className="pause" /> pauzedag</span>
          <span>⭐ hele groep alles</span>
        </div>
        <div className="cal-people">
          {people.map(({ id, p }) => (
            <span key={id} className="cal-person"><i style={{ background: p?.color }} />{p?.display_name}</span>
          ))}
        </div>
      </div>

      <GroupDay day={sel} title={relativeDay(sel)} />
    </div>
  );
}
