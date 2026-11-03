import { useState } from 'react';
import Feed from './Feed';
import AddActivity from './AddActivity';
import Ranking from './Ranking';
import Me from './Me';
import GroupPage from './GroupPage';
import Progress from './Progress';

export type Tab = 'feed' | 'ranking' | 'add' | 'me' | 'group' | 'progress';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'feed', label: 'Feed', icon: '🏠' },
  { id: 'ranking', label: 'Ranglijst', icon: '🏅' },
  { id: 'add', label: 'Training', icon: '＋' },
  { id: 'me', label: 'Ik', icon: '🙂' },
  { id: 'group', label: 'Groep', icon: '👥' },
];

export default function Shell() {
  const [tab, setTab] = useState<Tab>('feed');
  return (
    <div className="app">
      <main className="content">
        {tab === 'feed' && <Feed go={setTab} />}
        {tab === 'add' && <AddActivity onDone={() => setTab('feed')} />}
        {tab === 'ranking' && <Ranking />}
        {tab === 'me' && <Me go={setTab} />}
        {tab === 'progress' && <Progress back={() => setTab('me')} />}
        {tab === 'group' && <GroupPage />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={(t.id === 'add' ? 'tab add' : 'tab') + (tab === t.id || (t.id === 'me' && tab === 'progress') ? ' on' : '')}
            onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <span className="ti">{t.icon}</span>
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
