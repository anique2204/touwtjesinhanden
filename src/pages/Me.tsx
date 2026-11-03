import { useMemo, useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { activeStreak, computeScores } from '../points';
import ColorPicker from '../components/ColorPicker';
import ActivityCard from '../components/ActivityCard';
import Avatar from '../components/Avatar';
import type { Tab } from './Shell';

export default function Me({ go }: { go: (t: Tab) => void }) {
  const { me, data, currentChallenge: c, setMe, reload, session } = useStore();
  const [name, setName] = useState(me.display_name);
  const [color, setColor] = useState(me.color);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = data.activities.filter((a) => a.user_id === me.id);
  const score = useMemo(() => (c ? computeScores({
    challenge: c, memberIds: data.members.map((m) => m.user_id), activities: data.activities,
    goals: data.goals, habits: data.habits, checks: data.checks,
  }).find((s) => s.userId === me.id) : undefined), [c, data, me.id]);
  const streak = activeStreak(me.id, data.checks, data.activities);
  const myChecks = data.checks.filter((x) => x.user_id === me.id).length;
  const goalsCount = data.habits.filter((h) => h.user_id === me.id && !h.archived_on).length;

  async function saveProfile() {
    setBusy(true);
    const { data: p, error } = await supabase.from('profiles')
      .update({ display_name: name.trim(), color }).eq('id', me.id).select().single();
    setBusy(false);
    if (error) return alert(errMsg(error));
    setMe(p); setEditing(false); await reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div className="me-head">
          <Avatar p={{ ...me, color }} size={52} />
          <div>
            <h1>{me.display_name}</h1>
            <div className="muted small">{session.user.email}</div>
          </div>
        </div>
        <button className="link" onClick={() => setEditing((e) => !e)}>{editing ? 'Sluiten' : 'Bewerk'}</button>
      </header>

      {editing && (
        <div className="card stack">
          <label className="field"><span>Naam</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field"><span>Kleur</span><ColorPicker value={color} onChange={setColor} /></div>
          <button className="btn" disabled={busy || !name.trim()} onClick={saveProfile}>Opslaan</button>
        </div>
      )}

      <div className="tiles">
        <div className="tile"><b>{score?.total ?? 0}</b><span>punten</span></div>
        <div className="tile"><b>🔥 {streak}</b><span>{streak === 1 ? 'dag' : 'dagen'} op rij</span></div>
        <div className="tile"><b>{score?.perfectWeeks ?? 0}</b><span>perfecte weken</span></div>
        <div className="tile"><b>{myChecks}</b><span>vinkjes</span></div>
        <div className="tile"><b>{mine.length}</b><span>{mine.length === 1 ? 'training' : 'trainingen'}</span></div>
        <div className="tile"><b>{mine.filter((a) => a.is_pr).length}</b><span>PR's</span></div>
      </div>

      <NavCard icon="🎯" title="Mijn doelen" sub={goalsCount ? `${goalsCount} actieve ${goalsCount === 1 ? 'doel' : 'doelen'} · toevoegen of wijzigen` : 'Kies wat je wilt volhouden'} onClick={() => go('goals')} />
      <NavCard icon="📸" title="Mijn voortgang" sub="Foto’s, gewicht, taille en buikomtrek · 🔒 alleen voor jou" onClick={() => go('progress')} />
      <NavCard icon="👥" title={data.group.name} sub={`${data.members.length} leden · uitnodigen en challenges`} onClick={() => go('group')} />

      {mine.length > 0 && (
        <>
          <h2 className="section-title">Mijn trainingen</h2>
          {mine.slice(0, 20).map((a) => <ActivityCard key={a.id} a={a} />)}
        </>
      )}

      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Uitloggen</button>
    </div>
  );
}

function NavCard({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="card progress-card" onClick={onClick}>
      <span className="pc-icon">{icon}</span>
      <span className="grow left"><b>{title}</b><span className="muted small">{sub}</span></span>
      <span className="muted">›</span>
    </button>
  );
}
