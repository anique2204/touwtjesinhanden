import { useState } from 'react';
import Today from './Today';
import AddActivity from './AddActivity';
import Ranking from './Ranking';
import Me from './Me';
import GroupPage from './GroupPage';
import Progress from './Progress';
import Calendar from './Calendar';
import Goals from './Goals';

export type Tab = 'today' | 'calendar' | 'add' | 'ranking' | 'me' | 'group' | 'progress' | 'goals';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Vandaag', icon: '🏠' },
  { id: 'calendar', label: 'Kalender', icon: '📅' },
  { id: 'add', label: 'Toevoegen', icon: '＋' },
  { id: 'ranking', label: 'Ranglijst', icon: '🏅' },
  { id: 'me', label: 'Ik', icon: '🙂' },
];

// Subpagina's horen bij een tabblad (voor de markering onderin)
const PARENT: Partial<Record<Tab, Tab>> = { group: 'me', progress: 'me', goals: 'today' };

export default function Shell() {
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState(false);
  const go = (t: Tab) => { setTab(t); setSheet(false); window.scrollTo(0, 0); };
  const active = PARENT[tab] ?? tab;

  return (
    <div className="app">
      <main className="content">
        {tab === 'today' && <Today go={go} />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'add' && <AddActivity onDone={() => go('today')} />}
        {tab === 'ranking' && <Ranking />}
        {tab === 'me' && <Me go={go} />}
        {tab === 'group' && <GroupPage back={() => go('me')} />}
        {tab === 'progress' && <Progress back={() => go('me')} />}
        {tab === 'goals' && <Goals back={() => go('today')} />}
      </main>

      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-item" onClick={() => go('today')}>
              <span>✅</span><div><b>Doelen afvinken</b><div className="muted small">Wat heb je vandaag gedaan?</div></div>
            </button>
            <button className="sheet-item" onClick={() => go('add')}>
              <span>💪</span><div><b>Training toevoegen</b><div className="muted small">Hardlopen, kracht of iets anders</div></div>
            </button>
            <button className="sheet-item" onClick={() => go('goals')}>
              <span>🎯</span><div><b>Nieuw doel</b><div className="muted small">Een gewoonte die je wilt volhouden</div></div>
            </button>
            <button className="sheet-item" onClick={() => go('progress')}>
              <span>📸</span><div><b>Meting</b><div className="muted small">Foto’s, gewicht en maten 🔒 alleen voor jou</div></div>
            </button>
          </div>
        </div>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={(t.id === 'add' ? 'tab add' : 'tab') + (active === t.id && t.id !== 'add' ? ' on' : '')}
            onClick={() => (t.id === 'add' ? setSheet((s) => !s) : go(t.id))}>
            <span className="ti">{t.icon}</span>
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
