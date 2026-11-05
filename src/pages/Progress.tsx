import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { DEFAULT_MEASURES, MEASURE_FIELDS, POSES, photoOf, type MeasureKey, type Measurement, type Pose, type PrivateSettings } from '../types';
import { compressImage } from '../image';
import { today, shortDate } from '../dates';
import { allPhotoPaths, BUCKET, diff, fmt, loadMeasurements, signedUrls } from '../progress';

const PRIVATE_NOTE = '🔒 Niemand in de groep kan je foto’s, gewicht of maten zien. De beheerder van de app kan technisch bij de opslag, maar kijkt daar niet in.';

const hasPhotos = (m: Measurement) => POSES.some((p) => photoOf(m, p.id));
const ratio = (a?: number | null, b?: number | null) => (a != null && b != null && b > 0 ? Math.round((a / b) * 100) / 100 : null);
const r2 = (n: number | null) => (n == null ? '–' : n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function Progress({ back }: { back: () => void }) {
  const { me } = useStore();
  const [ms, setMs] = useState<Measurement[] | null>(null);
  const [settings, setSettings] = useState<PrivateSettings | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pose, setPose] = useState<Pose | 'all'>('front');
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        loadMeasurements(me.id),
        supabase.from('private_settings').select('*').eq('user_id', me.id).maybeSingle(),
      ]);
      setMs(list);
      setSettings((st.data as PrivateSettings | null) ?? null);
      setUrls(await signedUrls(allPhotoPaths(list)));
    } catch (e) { setError(errMsg(e)); }
  }, [me.id]);
  useEffect(() => { void load(); }, [load]);

  const fields: MeasureKey[] = useMemo(() => {
    const chosen = (settings?.measure_fields ?? DEFAULT_MEASURES).filter((k): k is MeasureKey => MEASURE_FIELDS.some((f) => f.key === k));
    return chosen.length ? chosen : DEFAULT_MEASURES;
  }, [settings]);
  const height = settings?.height_cm != null ? Number(settings.height_cm) : null;

  // De twee momenten die je vergelijkt (standaard: eerste en laatste meting)
  const list = ms ?? [];
  const A = list.find((m) => m.id === aId) ?? list[0];
  const B = list.find((m) => m.id === bId) ?? (list.length > 1 ? list[list.length - 1] : undefined);

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
    if (!ms || !A) return;
    setPdfBusy(true);
    try {
      const { makeProgressPdf } = await import('../pdf');
      const blob = await makeProgressPdf(ms, me.display_name, { a: A, b: B ?? null, fields, height });
      setPdf({ blob, name: `voortgang-${me.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.pdf` });
    } catch (e) { alert('PDF maken lukte niet: ' + errMsg(e)); }
    setPdfBusy(false);
  }
  async function openPdf() {
    if (!pdf) return;
    const { shareOrDownload } = await import('../pdf');
    await shareOrDownload(pdf.blob, pdf.name);
  }

  const done = async () => { setAdding(false); setEditing(null); setPdf(null); await load(); };
  if (adding) return <NewMeasurement fields={fields} onCancel={() => setAdding(false)} onSaved={done} />;
  if (editing) return <NewMeasurement fields={fields} edit={editing} urls={urls} onCancel={() => setEditing(null)} onSaved={done} />;
  if (showSettings) {
    return <MeasureSettings settings={settings} fields={fields} height={height}
      onCancel={() => setShowSettings(false)} onSaved={async () => { setShowSettings(false); setPdf(null); await load(); }} />;
  }

  // Rijen voor de vergelijking: ingeschakelde metingen + alles waar A of B een waarde heeft
  const rows = MEASURE_FIELDS.filter((f) => fields.includes(f.key) || A?.[f.key] != null || B?.[f.key] != null);
  const ratios = [
    { label: 'Taille ÷ heupen', a: ratio(A?.waist_cm, A?.hips_cm), b: ratio(B?.waist_cm, B?.hips_cm) },
    { label: 'Taille ÷ lengte', a: ratio(A?.waist_cm, height), b: ratio(B?.waist_cm, height) },
  ].filter((r) => r.a != null || r.b != null);
  const pick = (setter: (id: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { setter(e.target.value); setPdf(null); };
  const optionLabel = (m: Measurement, i: number) =>
    `${shortDate(m.measured_on)}${i === 0 ? ' (begin)' : i === list.length - 1 ? ' (nieuwste)' : ''}${hasPhotos(m) ? ' 📷' : ''}`;

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={back}>‹ Terug</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Mijn voortgang</h1>
        <button className="link" onClick={() => setShowSettings(true)} aria-label="Welke metingen">⚙️</button>
      </header>

      <div className="private">{PRIVATE_NOTE}</div>

      {error && <p className="error">{error}</p>}
      {!ms && !error && <div className="spinner" />}

      {ms && ms.length === 0 && (
        <div className="card stack">
          <h2>Leg je startpunt vast 📸</h2>
          <p className="muted">
            Meet je {MEASURE_FIELDS.filter((f) => fields.includes(f.key)).map((f) => f.label.toLowerCase()).join(', ')} en maak 4 foto’s.
            Over een paar weken zie je precies wat je bereikt hebt.
          </p>
          <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSettings(true)}>⚙️ Kies welke metingen je bijhoudt</button>
        </div>
      )}

      <button className="btn big" onClick={() => setAdding(true)}>＋ Nieuwe meting</button>

      {ms && A && (
        <>
          <div className="card stack">
            <h2>Vergelijk</h2>
            {list.length > 1 ? (
              <div className="moment-pick">
                <label className="field"><span>Van</span>
                  <select className="full" value={A.id} onChange={pick(setAId)}>
                    {list.map((m, i) => <option key={m.id} value={m.id}>{optionLabel(m, i)}</option>)}
                  </select>
                </label>
                <button className="round swap" aria-label="Omwisselen" onClick={() => { const a = A.id; setAId(B?.id ?? a); setBId(a); setPdf(null); }}>⇄</button>
                <label className="field"><span>Naar</span>
                  <select className="full" value={B?.id ?? ''} onChange={pick(setBId)}>
                    {list.map((m, i) => <option key={m.id} value={m.id}>{optionLabel(m, i)}</option>)}
                  </select>
                </label>
              </div>
            ) : <p className="muted small">Na je volgende meting kun je hier twee momenten naast elkaar zetten.</p>}

            <div className="m-table">
              <span /><span className="muted small">{shortDate(A.measured_on)}</span><span className="muted small">{B ? shortDate(B.measured_on) : '–'}</span><span className="muted small">Verschil</span>
              {rows.map((f) => {
                const a = A[f.key] ?? null, z = B?.[f.key] ?? null;
                return <Row key={f.key} label={f.label} a={fmt(a, f.unit)} b={B ? fmt(z, f.unit) : '–'} d={diff(a, z, f.unit)}
                  good={a != null && z != null && z < a} bad={a != null && z != null && z > a} />;
              })}
              {ratios.map((r) => (
                <Row key={r.label} label={r.label} a={r2(r.a)} b={r2(r.b)}
                  d={r.a != null && r.b != null ? diff(r.a, r.b, '', 2) : '–'} good={r.a != null && r.b != null && r.b < r.a} bad={false} />
              ))}
            </div>

            <div className="segmented">
              {POSES.map((p) => <button key={p.id} className={pose === p.id ? 'on' : ''} onClick={() => setPose(p.id)}>{p.label}</button>)}
              <button className={pose === 'all' ? 'on' : ''} onClick={() => setPose('all')}>Alle</button>
            </div>
            <div className={'compare' + (pose === 'all' ? ' all' : '')}>
              {(pose === 'all' ? POSES.map((p) => p.id) : [pose]).flatMap((ps) =>
                [A, B].map((m, i) => {
                  const path = m && photoOf(m, ps);
                  const u = path ? urls[path] : undefined;
                  return (
                    <figure key={`${ps}-${i}`}>
                      {u ? <img src={u} alt="" onClick={() => setZoom(u)} /> : <div className="ph-empty">{m ? 'Geen foto' : 'Kies een moment'}</div>}
                      <figcaption>
                        {pose === 'all' && <>{POSES.find((p) => p.id === ps)?.label} · </>}
                        <b>{m ? shortDate(m.measured_on) : '–'}</b>
                      </figcaption>
                    </figure>
                  );
                }))}
            </div>
          </div>

          <div className="card stack">
            <h2>📄 PDF-overzicht</h2>
            <p className="muted small">De twee gekozen momenten naast elkaar (foto’s en maten), plus al je metingen op een rij.</p>
            {!pdf
              ? <button className="btn" disabled={pdfBusy} onClick={makePdf}>{pdfBusy ? 'PDF maken…' : 'Maak PDF'}</button>
              : <button className="btn" onClick={openPdf}>Open / bewaar PDF</button>}
          </div>

          <h2>Alle metingen</h2>
          {[...list].reverse().map((m) => (
            <div key={m.id} className="card stack">
              <div className="m-head">
                <b>{shortDate(m.measured_on)}</b>
                <span className="hl-actions">
                  <button className="link small" onClick={() => { setEditing(m); window.scrollTo(0, 0); }}>Wijzig</button>
                  <button className="link danger small" onClick={() => remove(m)}>Verwijder</button>
                </span>
              </div>
              <div className="stats wrap">
                {MEASURE_FIELDS.filter((f) => m[f.key] != null || fields.includes(f.key)).map((f) => (
                  <div key={f.key}><b>{fmt(m[f.key] ?? null, f.unit)}</b><span>{f.label.toLowerCase()}</span></div>
                ))}
              </div>
              {hasPhotos(m) && <div className="thumbs">
                {POSES.map((p) => {
                  const path = photoOf(m, p.id);
                  const u = path ? urls[path] : undefined;
                  return u
                    ? <img key={p.id} src={u} alt={p.label} onClick={() => setZoom(u)} />
                    : <div key={p.id} className="ph-empty small">{p.label}</div>;
                })}
              </div>}
              {m.note && <p className="notes">{m.note}</p>}
              {list.length > 1 && (
                <div className="hl-actions">
                  <button className="link small" onClick={() => { setAId(m.id); setPdf(null); window.scrollTo(0, 0); }}>Zet als “van”</button>
                  <button className="link small" onClick={() => { setBId(m.id); setPdf(null); window.scrollTo(0, 0); }}>Zet als “naar”</button>
                </div>
              )}
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

function MeasureSettings({ settings, fields, height, onCancel, onSaved }: {
  settings: PrivateSettings | null; fields: MeasureKey[]; height: number | null; onCancel: () => void; onSaved: () => void;
}) {
  const { me } = useStore();
  const [chosen, setChosen] = useState<MeasureKey[]>(fields);
  const [h, setH] = useState(height != null ? String(height).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const toggle = (k: MeasureKey) => setChosen((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));

  async function save() {
    setBusy(true);
    const hv = parseFloat(h.replace(',', '.'));
    const { error } = await supabase.from('private_settings').upsert({
      user_id: me.id,
      measure_fields: MEASURE_FIELDS.map((f) => f.key).filter((k) => chosen.includes(k)),
      height_cm: Number.isFinite(hv) && hv >= 100 && hv <= 230 ? hv : null,
      ...(settings ? {} : { track_period: false, track_sex: false }),
    });
    setBusy(false);
    if (error) {
      return alert(/measure_fields|height_cm|column/i.test(error.message)
        ? 'De database moet nog even bijgewerkt worden (008_extra_metingen.sql). Vraag de beheerder.'
        : errMsg(error));
    }
    onSaved();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={onCancel}>‹ Annuleer</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Welke metingen?</h1>
        <span style={{ width: 70 }} />
      </header>
      <p className="muted small">Kies wat je wilt bijhouden. Je kunt dit altijd aanpassen; oude metingen blijven bewaard.</p>
      <div className="card list">
        {MEASURE_FIELDS.map((f) => (
          <label key={f.key} className="share-row measure-opt">
            <span className="grow"><b>{f.label}</b><span className="muted small">{f.tip}</span></span>
            <span className="switch"><input type="checkbox" checked={chosen.includes(f.key)} onChange={() => toggle(f.key)} /><span /></span>
          </label>
        ))}
      </div>
      <div className="card stack">
        <label className="field"><span>Je lengte in cm (optioneel)</span>
          <input inputMode="decimal" value={h} onChange={(e) => setH(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="168" />
        </label>
        <p className="muted small">
          Met je lengte rekent de app je <b>taille ÷ lengte</b> uit. Met heupen erbij ook <b>taille ÷ heupen</b>.
          Die verhoudingen laten je voortgang mooi zien, los van je gewicht.
        </p>
      </div>
      <button className="btn big" disabled={busy || chosen.length === 0} onClick={save}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
    </div>
  );
}

function NewMeasurement({ onCancel, onSaved, edit, urls = {}, fields }: {
  onCancel: () => void; onSaved: () => void; edit?: Measurement; urls?: Record<string, string>; fields: MeasureKey[];
}) {
  const { me } = useStore();
  const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  const [date, setDate] = useState(edit?.measured_on ?? today());
  // Ingeschakelde metingen + metingen die bij deze meting al een waarde hebben
  const shownFields = MEASURE_FIELDS.filter((f) => fields.includes(f.key) || (edit && edit[f.key] != null));
  const [vals, setVals] = useState<Partial<Record<MeasureKey, string>>>(
    () => Object.fromEntries(MEASURE_FIELDS.map((f) => [f.key, str(edit?.[f.key])])),
  );
  const [note, setNote] = useState(edit?.note ?? '');
  const [files, setFiles] = useState<Partial<Record<Pose, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Pose, string>>>({});
  const [removed, setRemoved] = useState<Partial<Record<Pose, boolean>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const clean = (s: string) => s.replace(/[^\d.,]/g, '');
  const oldPath = (p: Pose) => (edit ? photoOf(edit, p) : null);
  /** Wat er nu in het vakje staat: nieuwe foto, bestaande foto, of niets. */
  const shown = (p: Pose) => previews[p] ?? (!removed[p] && oldPath(p) ? urls[oldPath(p)!] ?? null : null);

  function pick(p: Pose, f: File | null) {
    setFiles((x) => ({ ...x, [p]: f ?? undefined }));
    setPreviews((x) => ({ ...x, [p]: f ? URL.createObjectURL(f) : undefined }));
    if (f) setRemoved((x) => ({ ...x, [p]: false }));
  }
  function removePhoto(p: Pose) {
    setFiles((x) => ({ ...x, [p]: undefined }));
    setPreviews((x) => ({ ...x, [p]: undefined }));
    setRemoved((x) => ({ ...x, [p]: true }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const nums = Object.fromEntries(shownFields.map((f) => [f.key, num(vals[f.key] ?? '')])) as Partial<Record<MeasureKey, number | null>>;
    const anyPhoto = POSES.some((p) => files[p.id] || (!removed[p.id] && oldPath(p.id)));
    if (Object.values(nums).every((v) => v == null) && !anyPhoto) {
      setError('Vul minstens één maat in of voeg een foto toe.'); return;
    }
    setError(null);
    const id = edit?.id ?? crypto.randomUUID();
    const uploaded: string[] = [];
    const toDelete: string[] = [];
    try {
      const photo: Partial<Record<`photo_${Pose}`, string | null>> = {};
      let i = 0;
      const todo = POSES.filter((p) => files[p.id]);
      for (const p of todo) {
        i += 1;
        setBusy(`Foto ${i} van ${todo.length} uploaden…`);
        const blob = await compressImage(files[p.id]!);
        const path = `${me.id}/${id}/${p.id}-${crypto.randomUUID().slice(0, 8)}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        uploaded.push(path);
        photo[`photo_${p.id}`] = path;
        if (oldPath(p.id)) toDelete.push(oldPath(p.id)!);
      }
      for (const p of POSES) {
        if (removed[p.id] && !files[p.id] && oldPath(p.id)) { photo[`photo_${p.id}`] = null; toDelete.push(oldPath(p.id)!); }
      }
      setBusy('Opslaan…');
      const fields = { measured_on: date, ...nums, note: note.trim() || null, ...photo };
      const { error: insErr } = edit
        ? await supabase.from('measurements').update(fields).eq('id', id)
        : await supabase.from('measurements').insert({ id, ...fields });
      if (insErr) throw insErr;
      if (toDelete.length) await supabase.storage.from(BUCKET).remove(toDelete);
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
        <h1 className="grow" style={{ textAlign: 'center' }}>{edit ? 'Meting wijzigen' : 'Nieuwe meting'}</h1>
        <span style={{ width: 70 }} />
      </header>

      <div className="private">{PRIVATE_NOTE}</div>

      <div className="card stack">
        <label className="field"><span>Datum</span>
          <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="row3">
          {shownFields.map((f) => (
            <label key={f.key} className="field"><span>{f.label} ({f.unit})</span>
              <input inputMode="decimal" value={vals[f.key] ?? ''} placeholder={f.placeholder}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: clean(e.target.value) }))} />
            </label>
          ))}
        </div>
        <details className="tips">
          <summary>Hoe meet ik dit goed?</summary>
          <ul>
            {shownFields.map((f) => <li key={f.key}><b>{f.label}:</b> {f.tip}</li>)}
            <li>Meet altijd op hetzelfde moment, het liefst ’s ochtends voor het eten, in dezelfde kleding.</li>
            <li>Lint strak maar niet in de huid drukken, recht houden, rustig uitademen.</li>
            <li>Kijk naar de trend over een paar weken, niet naar één meting. Eens per 1 à 2 weken meten is genoeg.</li>
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
            <div key={p.id} className="pose-wrap">
              <label className={'pose' + (shown(p.id) ? ' has' : '')}>
                {shown(p.id) ? <img src={shown(p.id)!} alt="" /> : <span className="pose-icon">📷</span>}
                <span className="pose-label">{p.label}</span>
                <input type="file" accept="image/*" hidden onChange={(e) => { pick(p.id, e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </label>
              {shown(p.id) && <button type="button" className="pose-x" aria-label={`Foto ${p.label} weghalen`} onClick={() => removePhoto(p.id)}>×</button>}
            </div>
          ))}
        </div>
        <p className="muted small">Tik op een vakje om een foto te kiezen of te vervangen, en op × om hem weg te halen.</p>
      </div>

      <div className="card">
        <label className="field"><span>Notitie (optioneel)</span>
          <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hoe voel je je?" />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={Boolean(busy)}>{busy ?? (edit ? 'Wijzigingen opslaan' : 'Meting opslaan')}</button>
    </form>
  );
}
