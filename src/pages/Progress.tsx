import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { POSES, photoOf, type Measurement, type Pose } from '../types';
import { compressImage } from '../image';
import { today, shortDate } from '../dates';
import { allPhotoPaths, BUCKET, diff, firstLast, fmt, loadMeasurements, signedUrls } from '../progress';

const PRIVATE_NOTE = '🔒 Niemand in de groep kan je foto’s, gewicht of maten zien. De beheerder van de app kan technisch bij de opslag, maar kijkt daar niet in.';

export default function Progress({ back }: { back: () => void }) {
  const { me } = useStore();
  const [ms, setMs] = useState<Measurement[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pose, setPose] = useState<Pose>('front');
  const [pdf, setPdf] = useState<{ blob: Blob; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await loadMeasurements(me.id);
      setMs(list);
      setUrls(await signedUrls(allPhotoPaths(list)));
    } catch (e) { setError(errMsg(e)); }
  }, [me.id]);

  useEffect(() => { void load(); }, [load]);

  async function remove(m: Measurement) {
    if (!confirm(`Meting van ${shortDate(m.measured_on)} verwijderen? Dit kan niet ongedaan worden.`)) return;
    const paths = POSES.map((p) => photoOf(m, p.id)).filter((x): x is string => Boolean(x));
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from('measurements').delete().eq('id', m.id);
    if (error) alert(errMsg(error));
    setPdf(null);
    await load();
  }

  async function makePdf() {
    if (!ms) return;
    setPdfBusy(true);
    try {
      const { makeProgressPdf } = await import('../pdf');
      const blob = await makeProgressPdf(ms, me.display_name);
      setPdf({ blob, name: `voortgang-${me.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.pdf` });
    } catch (e) { alert('PDF maken lukte niet: ' + errMsg(e)); }
    setPdfBusy(false);
  }

  async function openPdf() {
    if (!pdf) return;
    const { shareOrDownload } = await import('../pdf');
    await shareOrDownload(pdf.blob, pdf.name);
  }

  if (adding) {
    return <NewMeasurement onCancel={() => setAdding(false)} onSaved={async () => { setAdding(false); setPdf(null); await load(); }} />;
  }

  const w = ms ? firstLast(ms, 'weight_kg') : null;
  const t = ms ? firstLast(ms, 'waist_cm') : null;
  const b = ms ? firstLast(ms, 'belly_cm') : null;
  const withPose = (ms ?? []).filter((m) => photoOf(m, pose));
  const firstP = withPose[0], lastP = withPose.length > 1 ? withPose[withPose.length - 1] : undefined;

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={back}>‹ Terug</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Mijn voortgang</h1>
        <span style={{ width: 52 }} />
      </header>

      <div className="private">{PRIVATE_NOTE}</div>

      {error && <p className="error">{error}</p>}
      {!ms && !error && <div className="spinner" />}

      {ms && ms.length === 0 && (
        <div className="card stack">
          <h2>Leg je startpunt vast 📸</h2>
          <p className="muted">
            Meet je gewicht, taille en buikomtrek en maak 4 foto’s. Over een paar weken zie je precies wat je bereikt hebt.
          </p>
        </div>
      )}

      <button className="btn big" onClick={() => setAdding(true)}>＋ Nieuwe meting</button>

      {ms && ms.length > 0 && (
        <>
          <div className="card">
            <div className="m-table">
              <span /><span className="muted small">Begin</span><span className="muted small">Nu</span><span className="muted small">Verschil</span>
              {[
                { l: 'Gewicht', r: w!, k: 'weight_kg' as const, u: 'kg' },
                { l: 'Taille', r: t!, k: 'waist_cm' as const, u: 'cm' },
                { l: 'Buik', r: b!, k: 'belly_cm' as const, u: 'cm' },
              ].map(({ l, r, k, u }) => {
                const a = r.first?.[k] ?? null, z = r.last?.[k] ?? null;
                return (
                  <Row key={l} label={l} a={fmt(a, u)} b={r.last ? fmt(z, u) : '–'} d={diff(a, z, u)}
                    good={a != null && z != null && z < a} bad={a != null && z != null && z > a} />
                );
              })}
            </div>
          </div>

          <div className="card stack">
            <div className="segmented">
              {POSES.map((p) => (
                <button key={p.id} className={pose === p.id ? 'on' : ''} onClick={() => setPose(p.id)}>{p.label}</button>
              ))}
            </div>
            <div className="compare">
              {[{ l: 'Begin', m: firstP }, { l: 'Nu', m: lastP }].map(({ l, m }) => {
                const path = m && photoOf(m, pose);
                const u = path ? urls[path] : undefined;
                return (
                  <figure key={l}>
                    {u ? <img src={u} alt="" onClick={() => setZoom(u)} /> : <div className="ph-empty">{l === 'Nu' && firstP ? 'Nog geen nieuwere foto' : 'Geen foto'}</div>}
                    <figcaption><b>{l}</b>{m && ` · ${shortDate(m.measured_on)}`}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>

          <div className="card stack">
            <h2>📄 PDF-overzicht</h2>
            <p className="muted small">Je beginfoto’s naast je nieuwste, je maten met de verschillen, en al je metingen op een rij.</p>
            {!pdf
              ? <button className="btn" disabled={pdfBusy} onClick={makePdf}>{pdfBusy ? 'PDF maken…' : 'Maak PDF'}</button>
              : <button className="btn" onClick={openPdf}>Open / bewaar PDF</button>}
          </div>

          <h2>Alle metingen</h2>
          {[...ms].reverse().map((m) => (
            <div key={m.id} className="card stack">
              <div className="m-head">
                <b>{shortDate(m.measured_on)}</b>
                <button className="link danger small" onClick={() => remove(m)}>Verwijder</button>
              </div>
              <div className="stats">
                <div><b>{fmt(m.weight_kg, 'kg')}</b><span>gewicht</span></div>
                <div><b>{fmt(m.waist_cm, 'cm')}</b><span>taille</span></div>
                <div><b>{fmt(m.belly_cm, 'cm')}</b><span>buik</span></div>
              </div>
              {POSES.some((p) => photoOf(m, p.id)) && <div className="thumbs">
                {POSES.map((p) => {
                  const path = photoOf(m, p.id);
                  const u = path ? urls[path] : undefined;
                  return u
                    ? <img key={p.id} src={u} alt={p.label} onClick={() => setZoom(u)} />
                    : <div key={p.id} className="ph-empty small">{p.label}</div>;
                })}
              </div>}
              {m.note && <p className="notes">{m.note}</p>}
            </div>
          ))}
        </>
      )}

      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}
    </div>
  );
}

function Row({ label, a, b, d, good, bad }: { label: string; a: string; b: string; d: string; good: boolean; bad: boolean }) {
  return (
    <>
      <b>{label}</b><span>{a}</span><span>{b}</span>
      <b className={good ? 'good' : bad ? 'bad' : 'muted'}>{d}</b>
    </>
  );
}

function NewMeasurement({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { me } = useStore();
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [belly, setBelly] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<Partial<Record<Pose, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Pose, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const clean = (s: string) => s.replace(/[^\d.,]/g, '');

  function pick(p: Pose, f: File | null) {
    setFiles((x) => ({ ...x, [p]: f ?? undefined }));
    setPreviews((x) => ({ ...x, [p]: f ? URL.createObjectURL(f) : undefined }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const w = num(weight), t = num(waist), b = num(belly);
    if (w == null && t == null && b == null && !Object.values(files).some(Boolean)) {
      setError('Vul minstens één maat in of voeg een foto toe.'); return;
    }
    setError(null);
    const id = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const photo: Partial<Record<`photo_${Pose}`, string>> = {};
      let i = 0;
      const todo = POSES.filter((p) => files[p.id]);
      for (const p of todo) {
        i += 1;
        setBusy(`Foto ${i} van ${todo.length} uploaden…`);
        const blob = await compressImage(files[p.id]!);
        const path = `${me.id}/${id}/${p.id}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        uploaded.push(path);
        photo[`photo_${p.id}`] = path;
      }
      setBusy('Opslaan…');
      const { error: insErr } = await supabase.from('measurements').insert({
        id, measured_on: date, weight_kg: w, waist_cm: t, belly_cm: b, note: note.trim() || null, ...photo,
      });
      if (insErr) throw insErr;
      onSaved();
    } catch (err) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(errMsg(err));
      setBusy(null);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <header className="page-head">
        <button type="button" className="link" onClick={onCancel}>‹ Annuleer</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Nieuwe meting</h1>
        <span style={{ width: 70 }} />
      </header>

      <div className="private">{PRIVATE_NOTE}</div>

      <div className="card stack">
        <label className="field"><span>Datum</span>
          <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="row3">
          <label className="field"><span>Gewicht (kg)</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(clean(e.target.value))} placeholder="72,5" />
          </label>
          <label className="field"><span>Taille (cm)</span>
            <input inputMode="decimal" value={waist} onChange={(e) => setWaist(clean(e.target.value))} placeholder="80" />
          </label>
          <label className="field"><span>Buik (cm)</span>
            <input inputMode="decimal" value={belly} onChange={(e) => setBelly(clean(e.target.value))} placeholder="88" />
          </label>
        </div>
        <details className="tips">
          <summary>Hoe meet ik dit goed?</summary>
          <ul>
            <li><b>Taille:</b> rond het smalste deel van je middel, meestal net boven je navel.</li>
            <li><b>Buikomtrek:</b> precies ter hoogte van je navel.</li>
            <li>Meet ontspannen, na het uitademen, met het meetlint recht en niet te strak.</li>
            <li>Meet altijd op hetzelfde moment, het liefst ’s ochtends nuchter na het plassen.</li>
          </ul>
        </details>
      </div>

      <div className="card stack">
        <h2>Foto’s</h2>
        <p className="muted small">
          Tip: zelfde plek, zelfde licht, zelfde kleding. Zet je telefoon op heuphoogte en gebruik de zelfontspanner.
        </p>
        <div className="pose-grid">
          {POSES.map((p) => (
            <label key={p.id} className={'pose' + (previews[p.id] ? ' has' : '')}>
              {previews[p.id] ? <img src={previews[p.id]} alt="" /> : <span className="pose-icon">📷</span>}
              <span className="pose-label">{p.label}</span>
              <input type="file" accept="image/*" hidden onChange={(e) => pick(p.id, e.target.files?.[0] ?? null)} />
            </label>
          ))}
        </div>
        {Object.values(files).some(Boolean) && (
          <button type="button" className="link small" onClick={() => { setFiles({}); setPreviews({}); }}>Foto’s weghalen</button>
        )}
      </div>

      <div className="card">
        <label className="field"><span>Notitie (optioneel)</span>
          <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hoe voel je je?" />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={Boolean(busy)}>{busy ?? 'Meting opslaan'}</button>
    </form>
  );
}
