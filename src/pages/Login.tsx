import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';

const EMAIL_KEY = 'lockedin.email';
const MODE_KEY = 'lockedin.loginMode';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export default function Login({ hasInvite }: { hasInvite: boolean }) {
  const [email, setEmail] = useState(get(EMAIL_KEY) ?? '');
  const [mode, setMode] = useState<'link' | 'password'>(get(MODE_KEY) === 'password' ? 'password' : 'link');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remember() {
    set(EMAIL_KEY, email.trim());
    set(MODE_KEY, mode);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    remember();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(/rate|limit|seconds/i.test(error.message)
      ? 'Er zijn even te veel inlogmails verstuurd. Probeer het over een uurtje opnieuw, of log in met je wachtwoord.'
      : errMsg(error));
    else setSent(true);
  }

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    remember();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/invalid/i.test(error.message)
      ? 'E-mailadres of wachtwoord klopt niet. Nog geen wachtwoord ingesteld? Log dan eerst in met een link.'
      : errMsg(error));
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
        <h1>LockedIn</h1>
        <p className="muted">
          {hasInvite ? 'Je bent uitgenodigd! Log in met je e-mailadres om mee te doen.' : 'Samen je doelen halen. Samen volhouden.'}
        </p>

        {sent ? (
          <form onSubmit={verify} className="stack">
            <p>📬 Check je mail op <b>{email}</b> en klik op de link. Niets ontvangen? Kijk ook even in je spam.</p>
            <p className="muted small">
              Tip: stel daarna bij <b>Ik → Bewerk</b> een wachtwoord in. Dan kun je voortaan direct inloggen, ook in de app op je beginscherm.
            </p>
            <details className="muted small">
              <summary>Staat er een code in de mail?</summary>
              <div className="stack" style={{ marginTop: 8 }}>
                <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
                <button className="btn" disabled={busy || code.length < 6}>{busy ? 'Controleren…' : 'Inloggen met code'}</button>
              </div>
            </details>
            <button type="button" className="btn ghost" onClick={() => { setSent(false); setCode(''); }}>Terug</button>
          </form>
        ) : (
          <>
            <div className="segmented">
              <button type="button" className={mode === 'link' ? 'on' : ''} onClick={() => { setMode('link'); setError(null); }}>📧 Link per mail</button>
              <button type="button" className={mode === 'password' ? 'on' : ''} onClick={() => { setMode('password'); setError(null); }}>🔑 Wachtwoord</button>
            </div>
            <form onSubmit={mode === 'link' ? send : withPassword} className="stack">
              <label className="field">
                <span>E-mailadres</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" />
              </label>
              {mode === 'password' && (
                <label className="field">
                  <span>Wachtwoord</span>
                  <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              )}
              <button className="btn" disabled={busy}>
                {busy ? 'Even geduld…' : mode === 'link' ? 'Stuur inloglink' : 'Inloggen'}
              </button>
              {mode === 'password' && (
                <p className="muted small">Wachtwoord vergeten, of nog geen wachtwoord? Log in met een link en stel het in bij <b>Ik → Bewerk</b>.</p>
              )}
            </form>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
