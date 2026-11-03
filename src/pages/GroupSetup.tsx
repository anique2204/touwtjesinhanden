import { useEffect, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import type { Profile } from '../types';

interface Preview { id: string; name: string; member_count: number; max_members: number }

export default function GroupSetup({ me, inviteCode, onDone }: {
  me: Profile; inviteCode: string | null; onDone: (groupId: string | null) => void;
}) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('LockedIn');
  const [cName, setCName] = useState('November – December 2026');
  const [start, setStart] = useState('2026-11-01');
  const [end, setEnd] = useState('2026-12-31');

  useEffect(() => {
    if (!inviteCode) return;
    supabase.rpc('group_by_code', { p_code: inviteCode }).then(({ data, error }) => {
      if (error) setError(errMsg(error));
      setPreview((data as Preview[] | null)?.[0] ?? null);
    });
  }, [inviteCode]);

  async function join() {
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('join_group', { p_code: inviteCode });
    setBusy(false);
    if (error) setError(errMsg(error)); else onDone(data as string);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name.trim(), p_challenge_name: cName.trim(), p_start: start, p_end: end,
    });
    setBusy(false);
    if (error) setError(errMsg(error)); else onDone(data as string);
  }

  if (inviteCode) {
    return (
      <div className="center-page">
        <div className="card stack">
          {preview === undefined && <div className="spinner" />}
          {preview === null && (
            <>
              <h1>Link werkt niet</h1>
              <p className="muted">Deze uitnodigingslink is ongeldig of verlopen. Vraag om een nieuwe link.</p>
              <button className="btn ghost" onClick={() => onDone(null)}>Verder</button>
            </>
          )}
          {preview && (
            <>
              <h1>Hoi {me.display_name}!</h1>
              <p>Je bent uitgenodigd voor <b>{preview.name}</b> ({preview.member_count} {preview.member_count === 1 ? 'lid' : 'leden'}).</p>
              <button className="btn" disabled={busy} onClick={join}>Doe mee 💪</button>
              <button className="btn ghost" onClick={() => onDone(null)}>Niet nu</button>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="center-page">
      <form className="card stack" onSubmit={create}>
        <h1>Start een groep</h1>
        <p className="muted">
          Heb je een uitnodigingslink gekregen? Open die link dan, dan kom je vanzelf in de juiste groep.
        </p>
        <label className="field"><span>Groepsnaam</span>
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>Eerste challenge</span>
          <input required maxLength={60} value={cName} onChange={(e) => setCName(e.target.value)} />
        </label>
        <div className="row2">
          <label className="field"><span>Start</span><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field"><span>Einde</span><input type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <button className="btn" disabled={busy}>Groep aanmaken</button>
        <button type="button" className="btn ghost" onClick={() => supabase.auth.signOut()}>Uitloggen</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
