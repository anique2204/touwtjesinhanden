import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errMsg, supabase } from '../supabase';
import { COLORS } from '../types';
import ColorPicker from '../components/ColorPicker';

export default function ProfileSetup({ session, onDone }: { session: Session; onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.from('profiles').insert({ id: session.user.id, display_name: name.trim(), color });
    setBusy(false);
    if (error) setError(errMsg(error)); else onDone();
  }

  return (
    <div className="center-page">
      <form className="card stack" onSubmit={save}>
        <h1>Welkom! 👋</h1>
        <p className="muted">Hoe mogen de anderen je noemen?</p>
        <label className="field">
          <span>Naam</span>
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Voornaam" autoFocus />
        </label>
        <div className="field">
          <span>Jouw kleur</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <button className="btn" disabled={busy || !name.trim()}>Verder</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
