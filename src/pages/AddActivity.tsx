import { useEffect, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { SPORTS, type Sport } from '../types';
import { addDays, relativeDay, today } from '../dates';
import { compressImage } from '../image';
import { RULES } from '../points';

const DURATIONS = [20, 30, 45, 60, 90];

export default function AddActivity({ onDone }: { onDone: () => void }) {
  const { me, data, reload } = useStore();
  const [sport, setSport] = useState<Sport>('hardlopen');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today());
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [isPr, setIsPr] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const dates = [0, -1, -2].map((n) => addDays(today(), n));
  const mins = parseInt(duration, 10) || 0;
  const km = parseFloat(distance.replace(',', '.'));
  const pts = RULES.training;
  const recent = [...new Set(data.activities.filter((a) => a.user_id === me.id && a.sport === sport && a.label)
    .map((a) => a.label as string))].slice(0, 5);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mins < 1) { setError('Vul de duur in minuten in.'); return; }
    if (sport === 'overig' && !label.trim()) { setError('Wat heb je gedaan? Vul een omschrijving in.'); return; }
    setBusy(true); setError(null);
    try {
      let photo_path: string | null = null;
      if (file) {
        const blob = await compressImage(file);
        photo_path = `${data.group.id}/${me.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('photos').upload(photo_path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
      }
      const { error: insErr } = await supabase.from('activities').insert({
        group_id: data.group.id,
        sport,
        label: label.trim() || null,
        activity_date: date,
        duration_min: mins,
        distance_km: Number.isFinite(km) && km > 0 ? km : null,
        notes: notes.trim() || null,
        photo_path,
        is_pr: isPr,
      });
      if (insErr) {
        if (photo_path) await supabase.storage.from('photos').remove([photo_path]);
        throw insErr;
      }
      await reload();
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <header className="page-head"><h1>Training toevoegen</h1></header>

      <div className="card stack">
        <div className="segmented">
          {(Object.keys(SPORTS) as Sport[]).map((s) => (
            <button type="button" key={s} className={sport === s ? 'on' : ''} onClick={() => setSport(s)}>
              <span>{SPORTS[s].emoji}</span>{SPORTS[s].label}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{sport === 'overig' ? 'Wat heb je gedaan?' : 'Titel (optioneel)'}</span>
          <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)}
            placeholder={sport === 'overig' ? 'Padel, wandelen, yoga…' : sport === 'kracht' ? 'Benen, push, full body…' : 'Duurloop, intervallen…'} />
        </label>
        {recent.length > 0 && (
          <div className="chips">
            {recent.map((r) => <button type="button" key={r} className="chip" onClick={() => setLabel(r)}>{r}</button>)}
          </div>
        )}

        <div className="field">
          <span>Wanneer?</span>
          <div className="segmented">
            {dates.map((d) => (
              <button type="button" key={d} className={date === d ? 'on' : ''} onClick={() => setDate(d)}>{relativeDay(d)}</button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Duur (minuten)</span>
          <input inputMode="numeric" required value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} placeholder="45" />
        </label>
        <div className="chips">
          {DURATIONS.map((d) => (
            <button type="button" key={d} className={'chip' + (mins === d ? ' on' : '')} onClick={() => setDuration(String(d))}>{d} min</button>
          ))}
        </div>

        {sport !== 'kracht' && (
          <label className="field">
            <span>Afstand in km (optioneel)</span>
            <input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="8,5" />
          </label>
        )}

        <label className="field">
          <span>Notitie (optioneel)</span>
          <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={sport === 'kracht' ? 'Squat 5×5 @ 80kg…' : 'Hoe ging het?'} />
        </label>

        <div className="field">
          <span>Foto (optioneel)</span>
          {preview ? (
            <div className="photo-preview">
              <img src={preview} alt="" />
              <button type="button" className="link danger" onClick={() => setFile(null)}>Foto weghalen</button>
            </div>
          ) : (
            <label className="upload">
              📷 Foto of screenshot toevoegen
              <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>

        <label className="check">
          <input type="checkbox" checked={isPr} onChange={(e) => setIsPr(e.target.checked)} />
          <span>🏆 Dit is een persoonlijk record</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy}>
        {busy ? 'Opslaan…' : `Opslaan${pts ? ` · +${pts} punten` : ''}`}
      </button>
    </form>
  );
}
