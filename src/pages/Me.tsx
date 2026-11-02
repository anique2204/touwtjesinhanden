import { useMemo, useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { computeScores, dayStreak } from '../points';
import { formatDuration } from '../dates';
import GoalEditor from '../components/GoalEditor';
import ColorPicker from '../components/ColorPicker';
import ActivityCard from '../components/ActivityCard';
import Avatar from '../components/Avatar';

export default function Me() {
  const { me, data, currentChallenge: c, setMe, reload, session } = useStore();
  const [name, setName] = useState(me.display_name);
  const [color, setColor] = useState(me.color);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = data.activities.filter((a) => a.user_id === me.id);
  const score = useMemo(
    () => (c ? computeScores(c, data.members.map((m) => m.user_id), data.activities, data.goals).find((s) => s.userId === me.id) : undefined),
    [c, data, me.id],
  );
  const streak = dayStreak(data.activities, me.id);
  const totalMin = mine.reduce((s, a) => s + a.duration_min, 0);
  const totalKm = mine.reduce((s, a) => s + (Number(a.distance_km) || 0), 0);

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
        <div className="tile"><b>{mine.length}</b><span>{mine.length === 1 ? 'training' : 'trainingen'}</span></div>
        <div className="tile"><b>{formatDuration(totalMin)}</b><span>totaal</span></div>
        {totalKm > 0 && <div className="tile"><b>{totalKm.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</b><span>km</span></div>}
        <div className="tile"><b>{mine.filter((a) => a.is_pr).length}</b><span>PR's</span></div>
      </div>

      {c && (
        <div className="card stack">
          <h2>Mijn weekdoel</h2>
          <p className="muted small">Voor “{c.name}”. Week = maandag t/m zondag.</p>
          <GoalEditor challenge={c} />
        </div>
      )}

      <h2>Mijn trainingen</h2>
      {mine.length === 0 ? <div className="card empty">Nog niets gelogd.</div>
        : mine.slice(0, 30).map((a) => <ActivityCard key={a.id} a={a} />)}

      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Uitloggen</button>
    </div>
  );
}
