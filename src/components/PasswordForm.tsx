import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';

/** Wachtwoord instellen of wijzigen, zodat je zonder mail kunt inloggen. */
export default function PasswordForm() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError('Kies minstens 8 tekens.');
    if (pw !== pw2) return setError('De twee wachtwoorden zijn niet hetzelfde.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(/same|different/i.test(error.message) ? 'Dit is al je wachtwoord.' : errMsg(error));
    setDone(true); setPw(''); setPw2('');
    try { localStorage.setItem('lockedin.loginMode', 'password'); } catch { /* ignore */ }
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="field">
        <span>🔑 Wachtwoord</span>
        <span className="muted small">Hiermee log je direct in, zonder mail. Handig in de app op je beginscherm.</span>
      </div>
      <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nieuw wachtwoord (min. 8 tekens)" />
      <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Herhaal wachtwoord" />
      {error && <p className="error">{error}</p>}
      {done && <p className="small" style={{ color: 'var(--accent)' }}>✓ Opgeslagen. Je kunt nu inloggen met je e-mailadres en dit wachtwoord.</p>}
      <button className="btn ghost" disabled={busy || !pw}>{busy ? 'Opslaan…' : 'Wachtwoord opslaan'}</button>
    </form>
  );
}
