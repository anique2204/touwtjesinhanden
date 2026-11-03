import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';

export default function Login({ hasInvite }: { hasInvite: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(errMsg(error)); else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('Die code klopt niet of is verlopen.');
  }

  return (
    <div className="center-page">
      <div className="card login">
        <img src="/icon.svg" alt="" className="logo" />
        <h1>De touwtjes in handen</h1>
        <p className="muted">
          {hasInvite ? 'Je bent uitgenodigd! Log in met je e-mailadres om mee te doen.' : 'Samen sporten, samen volhouden.'}
        </p>

        {!sent ? (
          <form onSubmit={send} className="stack">
            <label className="field">
              <span>E-mailadres</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" />
            </label>
            <button className="btn" disabled={busy}>{busy ? 'Versturen…' : 'Stuur inloglink'}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p>
              📬 Check je mail op <b>{email}</b> en klik op de link. Niets ontvangen? Kijk ook even in je spam.
            </p>
            <p className="muted small">
              Staat er een code in de mail? Dan kun je die hieronder invullen.
            </p>
            <label className="field">
              <span>Code uit de mail</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            </label>
            <button className="btn" disabled={busy || code.length < 6}>{busy ? 'Controleren…' : 'Inloggen'}</button>
            <button type="button" className="btn ghost" onClick={() => { setSent(false); setCode(''); }}>Ander e-mailadres</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
