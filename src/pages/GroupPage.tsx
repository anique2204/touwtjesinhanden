import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { addDays, shortDate, today } from '../dates';
import Avatar from '../components/Avatar';
import { callNotify } from '../push';

export default function GroupPage({ back }: { back: () => void }) {
  const { me, data, isAdmin, reload } = useStore();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?join=${data.group.invite_code}`;

  const last = data.challenges[0];
  const nextStart = last ? addDays(last.end_date, 1) : today();
  const [showNew, setShowNew] = useState(false);
  const [cName, setCName] = useState('');
  const [start, setStart] = useState(nextStart);
  const [end, setEnd] = useState(addDays(nextStart, 58));
  const [busy, setBusy] = useState(false);

  async function share() {
    const text = `Doe mee met "${data.group.name}" 💪\n\nTip: open de link in Safari (iPhone) of Chrome (Android), niet in WhatsApp zelf. Zet de app daarna op je beginscherm en stel bij Ik → Bewerk een wachtwoord in, dan blijf je makkelijk ingelogd.`;
    if (navigator.share) {
      try { await navigator.share({ title: data.group.name, text, url: link }); return; } catch { /* geannuleerd */ }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function newLink() {
    if (!confirm('Nieuwe link maken? De oude link werkt dan niet meer.')) return;
    const { error } = await supabase.rpc('reset_invite_code', { gid: data.group.id });
    if (error) alert(errMsg(error));
    await reload();
  }

  async function createChallenge(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('challenges').insert({
      group_id: data.group.id, name: cName.trim(), start_date: start, end_date: end, created_by: me.id,
    });
    setBusy(false);
    if (error) return alert(errMsg(error));
    setShowNew(false); setCName(''); await reload();
  }

  const t = today();
  const [renaming, setRenaming] = useState(false);
  const [bMsg, setBMsg] = useState('');
  const [bBusy, setBBusy] = useState(false);
  const [bResult, setBResult] = useState<string | null>(null);

  async function broadcast(e: FormEvent) {
    e.preventDefault();
    if (!bMsg.trim() || !confirm(`Dit bericht als melding naar de hele groep sturen?\n\n"${bMsg.trim()}"`)) return;
    setBBusy(true); setBResult(null);
    try {
      const r = await callNotify({ action: 'broadcast', group_id: data.group.id, message: bMsg.trim() });
      setBResult(`Verstuurd naar ${r.sent} ${Number(r.sent) === 1 ? 'toestel' : 'toestellen'} ✓ (wie meldingen aan heeft staan)`);
      setBMsg('');
    } catch (err) { setBResult('Versturen lukte niet: ' + errMsg(err)); }
    setBBusy(false);
  }
  const [gName, setGName] = useState(data.group.name);

  async function rename(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('groups').update({ name: gName.trim() }).eq('id', data.group.id);
    if (error) return alert(errMsg(error));
    setRenaming(false); await reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={back}>‹ Terug</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>{data.group.name}</h1>
        <span style={{ width: 52 }} />
      </header>

      {isAdmin && (
        <div className="card stack">
          {!renaming ? (
            <div className="goal-row">
              <span className="grow"><span className="muted small">Groepsnaam</span><br /><b>{data.group.name}</b></span>
              <button className="link small" onClick={() => setRenaming(true)}>Wijzig</button>
            </div>
          ) : (
            <form className="stack" onSubmit={rename}>
              <label className="field"><span>Groepsnaam</span>
                <input required maxLength={60} value={gName} onChange={(e) => setGName(e.target.value)} autoFocus />
              </label>
              <div className="row2">
                <button type="button" className="btn ghost" onClick={() => { setRenaming(false); setGName(data.group.name); }}>Annuleer</button>
                <button className="btn" disabled={!gName.trim()}>Opslaan</button>
              </div>
            </form>
          )}
        </div>
      )}

      {isAdmin && (
        <form className="card stack" onSubmit={broadcast}>
          <h2>📣 Bericht aan de groep</h2>
          <p className="muted small">Verschijnt als pushmelding bij iedereen die meldingen aan heeft staan.</p>
          <textarea rows={2} maxLength={200} value={bMsg} onChange={(e) => setBMsg(e.target.value)} placeholder="Bijv. Nog 2 weken, zet 'm op! 💪" />
          <button className="btn" disabled={bBusy || !bMsg.trim()}>{bBusy ? 'Versturen…' : 'Verstuur melding'}</button>
          {bResult && <p className="small muted">{bResult}</p>}
        </form>
      )}

      <div className="card stack">
        <h2>Uitnodigen</h2>
        <p className="muted small">Stuur deze link in de groepsapp. Wie hem opent en inlogt, komt in de groep.</p>
        <div className="invite"><code>{link}</code></div>
        <button className="btn" onClick={share}>{copied ? 'Gekopieerd ✓' : 'Deel uitnodigingslink'}</button>
        {isAdmin && <button className="link small" onClick={newLink}>Nieuwe link maken</button>}
      </div>

      <div className="card list">
        <h2>Leden ({data.members.length}/{data.group.max_members})</h2>
        {data.members.map((m) => (
          <div key={m.user_id} className="member">
            <Avatar p={data.profiles[m.user_id]} />
            <span className="grow">{data.profiles[m.user_id]?.display_name}{m.user_id === me.id && ' (jij)'}</span>
            {m.role === 'admin' && <span className="badge">admin</span>}
          </div>
        ))}
      </div>

      <div className="card list">
        <h2>Challenges</h2>
        {data.challenges.map((c) => (
          <div key={c.id} className="member">
            <span className="grow"><b>{c.name}</b><br />
              <span className="muted small">{shortDate(c.start_date)} – {shortDate(c.end_date)}</span>
            </span>
            <span className="badge">{c.end_date < t ? 'afgelopen' : c.start_date > t ? 'gepland' : 'bezig'}</span>
          </div>
        ))}
        {isAdmin && !showNew && <button className="btn ghost" onClick={() => setShowNew(true)}>＋ Nieuwe challenge</button>}
        {showNew && (
          <form className="stack" onSubmit={createChallenge}>
            <label className="field"><span>Naam</span>
              <input required maxLength={60} value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Januari – Februari 2027" />
            </label>
            <div className="row2">
              <label className="field"><span>Start</span><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="field"><span>Einde</span><input type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
            <p className="muted small">Iedereen stelt daarna een nieuw weekdoel in. De oude challenge blijft in de ranglijst te bekijken.</p>
            <button className="btn" disabled={busy}>Aanmaken</button>
            <button type="button" className="btn ghost" onClick={() => setShowNew(false)}>Annuleren</button>
          </form>
        )}
      </div>
    </div>
  );
}
