import { useCallback, useEffect, useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { callNotify, currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '../push';

interface Prefs {
  morning: boolean; morning_time: string; evening: boolean; evening_time: string;
  habit_reminders: boolean; reactions: boolean; group_all_done: boolean; group_hard_goal: boolean;
  broadcasts: boolean; quiet_start: string; quiet_end: string;
}
const DEFAULTS: Prefs = {
  morning: true, morning_time: '08:00', evening: true, evening_time: '19:00', habit_reminders: true,
  reactions: true, group_all_done: true, group_hard_goal: true, broadcasts: true, quiet_start: '22:00', quiet_end: '08:00',
};

const TOGGLES: { key: keyof Prefs; icon: string; label: string; sub: string; time?: keyof Prefs }[] = [
  { key: 'morning', icon: '☀️', label: 'Ochtendboodschap', sub: 'Het weer in Breukelen + een peptalk', time: 'morning_time' },
  { key: 'evening', icon: '🌙', label: 'Avondherinnering', sub: 'Alleen als je nog dagelijkse doelen open hebt', time: 'evening_time' },
  { key: 'habit_reminders', icon: '⏰', label: 'Herinneringen per doel', sub: 'De tijden die je bij een doel instelt' },
  { key: 'reactions', icon: '💕', label: 'Reacties op jou', sub: 'High fives, hartjes, kudos en reacties (gebundeld)' },
  { key: 'group_all_done', icon: '🎉', label: 'Iemand heeft alles gedaan', sub: 'Als iemand al haar dagelijkse doelen heeft afgevinkt' },
  { key: 'group_hard_goal', icon: '🔥', label: 'Iemand haalt een 🔥-doel', sub: 'Als iemand een moeilijk doel haalt' },
  { key: 'broadcasts', icon: '📣', label: 'Berichten van de beheerder', sub: 'Berichtjes aan de hele groep' },
];

export default function Notifications({ back }: { back: () => void }) {
  const { me } = useStore();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = pushSupported();
  const iosNeedsHome = isIos() && !isStandalone();
  const permission = supported ? Notification.permission : 'denied';

  const load = useCallback(async () => {
    const { data } = await supabase.from('notification_prefs').select('*').eq('user_id', me.id).maybeSingle();
    setPrefs({ ...DEFAULTS, ...(data ?? {}) });
    setSubscribed(Boolean(await currentSubscription().catch(() => null)));
  }, [me.id]);
  useEffect(() => { void load(); }, [load]);

  async function save(next: Prefs) {
    setPrefs(next);
    const { error } = await supabase.from('notification_prefs').upsert({ user_id: me.id, ...next, updated_at: new Date().toISOString() });
    if (error) setError(errMsg(error));
  }

  async function turnOn() {
    setBusy('on'); setError(null); setMsg(null);
    try {
      await enablePush();
      if (!prefs) await save(DEFAULTS);
      setSubscribed(true);
      setMsg('Meldingen staan aan op dit toestel ✓ Tik op "Stuur testmelding" om het te proberen.');
    } catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }
  async function turnOff() {
    setBusy('off'); setError(null); setMsg(null);
    try { await disablePush(); setSubscribed(false); setMsg('Meldingen staan uit op dit toestel.'); } catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }
  async function test() {
    setBusy('test'); setError(null); setMsg(null);
    try {
      const r = await callNotify({ action: 'test' });
      setMsg(Number(r.sent) > 0 ? 'Testmelding verstuurd! Hij komt binnen een paar seconden binnen. 🔔' : 'Geen toestel gevonden. Zet eerst meldingen aan.');
    } catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={back}>‹ Terug</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Meldingen</h1>
        <span style={{ width: 52 }} />
      </header>

      <div className="card stack">
        <h2>🔔 Op dit toestel</h2>
        {!supported && !iosNeedsHome && (
          <p className="muted small">Deze browser ondersteunt geen meldingen. Probeer Chrome (Android) of zet de app op je beginscherm (iPhone).</p>
        )}
        {iosNeedsHome && (
          <div className="notice">
            <b>📲 Eerst op je beginscherm zetten</b>
            Op de iPhone werken meldingen alleen in de app op je beginscherm: tik in Safari op het deel-icoon (vierkantje met pijl) → <b>Zet op beginscherm</b>.
            Open LockedIn daarna vanaf je beginscherm en kom hier terug.
          </div>
        )}
        {supported && !iosNeedsHome && (
          subscribed ? (
            <>
              <p className="small">✅ Meldingen staan <b>aan</b> op dit toestel.</p>
              <div className="row2">
                <button className="btn" disabled={busy !== null} onClick={test}>{busy === 'test' ? 'Versturen…' : 'Stuur testmelding'}</button>
                <button className="btn ghost" disabled={busy !== null} onClick={turnOff}>Uitzetten</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">
                {permission === 'denied'
                  ? 'Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon (Instellingen → Meldingen → LockedIn), en probeer het dan opnieuw.'
                  : 'Zet meldingen aan om herinneringen en nieuwtjes uit de groep te krijgen. Je kiest hieronder zelf wat je wilt ontvangen.'}
              </p>
              <button className="btn big" disabled={busy !== null} onClick={turnOn}>{busy === 'on' ? 'Even geduld…' : '🔔 Meldingen aanzetten'}</button>
            </>
          )
        )}
        {msg && <p className="small" style={{ color: 'var(--accent)' }}>{msg}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {prefs && (
        <>
          <div className="card list">
            <h2>Wat wil je ontvangen?</h2>
            {TOGGLES.map((t) => (
              <div key={t.key} className="notif-row">
                <label className="share-row">
                  <span className="pc-icon small-icon">{t.icon}</span>
                  <span className="grow"><b>{t.label}</b><span className="muted small">{t.sub}</span></span>
                  <span className="switch">
                    <input type="checkbox" checked={Boolean(prefs[t.key])} onChange={(e) => save({ ...prefs, [t.key]: e.target.checked })} />
                    <span />
                  </span>
                </label>
                {t.time && prefs[t.key] && (
                  <label className="time-row">
                    <span className="muted small">Hoe laat?</span>
                    <input type="time" value={String(prefs[t.time])} onChange={(e) => e.target.value && save({ ...prefs, [t.time!]: e.target.value })} />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="card stack">
            <h2>😴 Stille uren</h2>
            <p className="muted small">Reacties en groepsnieuws wachten tot na deze tijden. Je eigen herinneringen komen gewoon op de tijd die jij kiest.</p>
            <div className="row2">
              <label className="field"><span>Van</span>
                <input type="time" value={prefs.quiet_start} onChange={(e) => e.target.value && save({ ...prefs, quiet_start: e.target.value })} />
              </label>
              <label className="field"><span>Tot</span>
                <input type="time" value={prefs.quiet_end} onChange={(e) => e.target.value && save({ ...prefs, quiet_end: e.target.value })} />
              </label>
            </div>
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>
            Herinneringen per doel stel je in bij een doel: <b>Doelen beheren → Wijzig → 🔔 Herinneringen</b>.
          </p>
        </>
      )}
    </div>
  );
}
