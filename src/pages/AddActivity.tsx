import { useEffect, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { SPORTS, type Activity, type Sport } from '../types';
import { addDays, relativeDay, today } from '../dates';
import { compressImage } from '../image';

const DURATIONS = [20, 30, 45, 60, 90];

/** Training toevoegen, of met `edit` een bestaande training wijzigen. */
export default function AddActivity({ onDone, onCancel, edit, editPhotoUrl }: {
  onDone: () => void; onCancel?: () => void; edit?: Activity; editPhotoUrl?: string | null;
}) {
  const { me, data, reload } = useStore();
  const [sport, setSport] = useState<Sport>(edit?.sport ?? 'hardlopen');
  const [label, setLabel] = useState(edit?.label ?? '');
  const [date, setDate] = useState(edit?.activity_date ?? today());
  const [duration, setDuration] = useState(edit ? String(edit.duration_min) : '');
  const [distance, setDistance] = useState(edit?.distance_km != null ? String(edit.distance_km).replace('.', ',') : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [isPr, setIsPr] = useState(edit?.is_pr ?? false);
  const [keepPhoto, setKeepPhoto] = useState(Boolean(edit?.photo_path));
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

  const recentDates = [0, -1, -2].map((n) => addDays(today(), n));
  // Een oudere training kun je nog wijzigen, maar niet naar een andere datum verplaatsen
  const dateLocked = Boolean(edit && !recentDates.includes(edit.activity_date));
  const dates = dateLocked ? [edit!.activity_date] : recentDates;
  const mins = parseInt(duration, 10) || 0;
  const km = parseFloat(distance.replace(',', '.'));
  const recent = [...new Set(data.activities.filter((a) => a.user_id === me.id && a.sport === sport && a.label)
    .map((a) => a.label as string))].slice(0, 5);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mins < 1) { setError('Vul de duur in minuten in.'); return; }
    if (sport === 'overig' && !label.trim()) { setError('Wat heb je gedaan? Vul een omschrijving in.'); return; }
    setBusy(true); setError(null);
    try {
      const oldPhoto = edit?.photo_path ?? null;
      let photo_path: string | null = keepPhoto ? oldPhoto : null;
      let uploaded: string | null = null;
      if (file) {
        const blob = await compressImage(file);
        uploaded = photo_path = `${data.group.id}/${me.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('photos').upload(photo_path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
      }
      const fields = {
        sport,
        label: label.trim() || null,
        activity_date: date,
        duration_min: mins,
        distance_km: Number.isFinite(km) && km > 0 ? km : null,
        notes: notes.trim() || null,
        photo_path,
        is_pr: isPr,
      };
      const { error: insErr } = edit
        ? await supabase.from('activities').update(fields).eq('id', edit.id)
        : await supabase.from('activities').insert({ ...fields, group_id: data.group.id });
      if (insErr) {
        if (uploaded) await supabase.storage.from('photos').remove([uploaded]);
        throw insErr;
      }
      // Oude foto opruimen als die vervangen of weggehaald is
      if (oldPhoto && oldPhoto !== photo_path) await supabase.storage.from('photos').remove([oldPhoto]);
      await reload();
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <header className="page-head">
        {onCancel && <button type="button" className="link" onClick={onCancel}>‹ Annuleer</button>}
        <h1 className={onCancel ? 'grow' : ''} style={onCancel ? { textAlign: 'center' } : undefined}>
          {edit ? 'Training wijzigen' : 'Training toevoegen'}
        </h1>
        {onCancel && <span style={{ width: 70 }} />}
      </header>

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
          <span>Wanneer?{dateLocked && ' (datum kan niet meer veranderen)'}</span>
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
          {preview || (keepPhoto && editPhotoUrl) ? (
            <div className="photo-preview">
              <img src={preview ?? editPhotoUrl ?? ''} alt="" />
              <button type="button" className="link danger" onClick={() => { setFile(null); setKeepPhoto(false); }}>Foto weghalen</button>
            </div>
          ) : (
            <label className="upload">
              📷 Foto of screenshot toevoegen
              <input type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setKeepPhoto(false); }} />
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
        {busy ? 'Opslaan…' : edit ? 'Wijzigingen opslaan' : 'Opslaan'}
      </button>
    </form>
  );
}
