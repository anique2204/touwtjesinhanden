import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import MoodIcon from '../components/MoodIcon';
import { SYMPTOMS, type BodyDay, type Flow, type PrivateSettings } from '../types';
import { addDays, fromISO, mondayOf, relativeDay, shortDate, toISO, today } from '../dates';
import { cycleInfo, nextPeriod, PHASE_ORDER, PHASES, phaseOn, type Phase } from '../cycle';
import { dayStatus } from '../points';

export const PRIVATE_NOTE = '🔒 Alleen jij ziet dit in de app. De beheerder van de app kan technisch bij de opslag, maar kijkt daar niet in.';
const FLOWS: { id: Flow; label: string }[] = [
  { id: 'spotting', label: 'Spotting' }, { id: 'licht', label: 'Licht' }, { id: 'normaal', label: 'Normaal' }, { id: 'hevig', label: 'Hevig' },
];
const WD = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const monthName = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

export default function Body({ back }: { back: () => void }) {
  const { me } = useStore();
  const [settings, setSettings] = useState<PrivateSettings | null | undefined>(undefined);
  const [days, setDays] = useState<BodyDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([
      supabase.from('private_settings').select('*').eq('user_id', me.id).maybeSingle(),
      supabase.from('body_days').select('*').eq('user_id', me.id).order('day'),
    ]);
    if (s.error || d.error) { setError(errMsg(s.error ?? d.error)); return; }
    setSettings(s.data as PrivateSettings | null);
    setDays((d.data ?? []) as BodyDay[]);
  }, [me.id]);
  useEffect(() => { void load(); }, [load]);

  const head = (
    <header className="page-head">
      <button className="link" onClick={back}>‹ Terug</button>
      <h1 className="grow" style={{ textAlign: 'center' }}>Cyclus & lichaam</h1>
      {settings && (settings.track_period || settings.track_sex)
        ? <button className="link" onClick={() => setShowSettings((x) => !x)}>⚙️</button>
        : <span style={{ width: 52 }} />}
    </header>
  );

  if (error) return <div className="stack">{head}<p className="error">{error}</p></div>;
  if (settings === undefined) return <div className="stack">{head}<div className="spinner" /></div>;

  const enabled = settings && (settings.track_period || settings.track_sex);
  if (!enabled || showSettings) {
    return (
      <div className="stack">
        {head}
        <SettingsForm settings={settings} onSaved={async () => { setShowSettings(false); await load(); }}
          onWiped={async () => { setShowSettings(false); await load(); }} hasData={days.length > 0} />
      </div>
    );
  }
  return <div className="stack">{head}<BodyMain settings={settings!} days={days} reload={load} /></div>;
}

function SettingsForm({ settings, onSaved, onWiped, hasData }: {
  settings: PrivateSettings | null; onSaved: () => void; onWiped: () => void; hasData: boolean;
}) {
  const { me } = useStore();
  const [period, setPeriod] = useState(settings?.track_period ?? true);
  const [sex, setSex] = useState(settings?.track_sex ?? false);
  const [cycleLen, setCycleLen] = useState(settings?.cycle_length ? String(settings.cycle_length) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const n = parseInt(cycleLen, 10);
    const { error } = await supabase.from('private_settings').upsert({
      user_id: me.id, track_period: period, track_sex: sex, cycle_length: n >= 18 && n <= 60 ? n : null,
    });
    setBusy(false);
    if (error) return alert(errMsg(error));
    onSaved();
  }

  async function wipe() {
    if (!confirm('Al je cyclus- en lichaamsgegevens definitief wissen? Dit kan niet ongedaan worden.')) return;
    const a = await supabase.from('body_days').delete().eq('user_id', me.id);
    const b = await supabase.from('private_settings').delete().eq('user_id', me.id);
    if (a.error || b.error) return alert(errMsg(a.error ?? b.error));
    onWiped();
  }

  return (
    <>
      {!settings && (
        <div className="card stack">
          <h2>🌸 Je lichaam, je ritme</h2>
          <p className="muted">
            Houd je menstruatie bij en zie hoe je cyclus samenhangt met je mood en je doelen.
            Bijvoorbeeld dat je in bepaalde weken minder energie hebt. Dat is normaal, en dan weet je dat je mild mag zijn voor jezelf.
          </p>
          <p className="muted small">Gebruik je al Clue of een andere app? Dan kun je hier ook alleen de startdagen invullen.</p>
        </div>
      )}
      <div className="private">{PRIVATE_NOTE} Niemand in de groep ziet hier iets van.</div>
      <div className="card stack">
        <label className="share-row">
          <span className="grow"><b>🩸 Menstruatie bijhouden</b><span className="muted small">Menstruatiedagen, klachten en je cyclusfase</span></span>
          <span className="switch"><input type="checkbox" checked={period} onChange={(e) => setPeriod(e.target.checked)} /><span /></span>
        </label>
        <label className="share-row">
          <span className="grow"><b>💞 Seks bijhouden</b><span className="muted small">Wanneer, en eventueel of het beschermd was</span></span>
          <span className="switch"><input type="checkbox" checked={sex} onChange={(e) => setSex(e.target.checked)} /><span /></span>
        </label>
        {period && (
          <label className="field">
            <span>Gemiddelde cycluslengte in dagen (optioneel)</span>
            <input inputMode="numeric" value={cycleLen} onChange={(e) => setCycleLen(e.target.value.replace(/\D/g, ''))} placeholder="28" />
            <span className="muted small">Weet je het niet? Laat leeg. De app rekent het uit zodra je een paar cycli hebt ingevuld.</span>
          </label>
        )}
        <button className="btn" disabled={busy || (!period && !sex)} onClick={save}>{settings ? 'Opslaan' : 'Aanzetten'}</button>
        {!period && !sex && <p className="muted small">Zet minstens één van de twee aan.</p>}
      </div>
      {settings && (
        <div className="card stack">
          <b>Gegevens wissen</b>
          <p className="muted small">Wil je stoppen? Dan kun je hier alles wat je in deze module hebt ingevuld definitief verwijderen.</p>
          <button className="btn ghost danger-text" onClick={wipe} disabled={!hasData && !settings}>Alles wissen</button>
        </div>
      )}
    </>
  );
}

function BodyMain({ settings, days, reload }: { settings: PrivateSettings; days: BodyDay[]; reload: () => Promise<void> }) {
  const { me, data } = useStore();
  const t = today();
  const [sel, setSel] = useState(t);
  const [month, setMonth] = useState(t.slice(0, 7));
  const info = useMemo(() => cycleInfo(days, settings.cycle_length, settings.period_length), [days, settings]);
  const now = phaseOn(t, info);
  const next = nextPeriod(info);
  const byDay = useMemo(() => Object.fromEntries(days.map((d) => [d.day, d])), [days]);

  // Kalender
  const first = `${month}-01`;
  const f = fromISO(first);
  const nextMonth = toISO(new Date(f.getFullYear(), f.getMonth() + 1, 1));
  const prevMonth = toISO(new Date(f.getFullYear(), f.getMonth() - 1, 1));
  const last = addDays(nextMonth, -1);
  const cells: string[] = [];
  for (let d = mondayOf(first); d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  const predicted = new Set<string>();
  if (settings.track_period && next) for (let i = 0; i < info.avgPeriod; i++) predicted.add(addDays(next, i));

  // Inzichten per fase: gemiddelde mood en % doelen gehaald
  const insights = useMemo(() => {
    const acc: Record<Phase, { mood: number[]; goals: number[] }> = {
      menstruatie: { mood: [], goals: [] }, folliculair: { mood: [], goals: [] }, ovulatie: { mood: [], goals: [] }, luteaal: { mood: [], goals: [] },
    };
    if (!info.starts.length) return null;
    for (let d = info.starts[0]; d <= t; d = addDays(d, 1)) {
      const ph = phaseOn(d, info);
      if (!ph) continue;
      const m = data.myMoods.find((x) => x.day === d);
      if (m) acc[ph.phase].mood.push(m.score);
      const st = dayStatus(me.id, d, data.habits, data.checks, data.activities, data.pauses);
      if (st.total > 0) acc[ph.phase].goals.push(st.done / st.total);
    }
    return acc;
  }, [info, data, me.id, t]);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const enough = insights && PHASE_ORDER.filter((p) => insights[p].mood.length >= 3 || insights[p].goals.length >= 3).length >= 2;

  return (
    <>
      <div className="private">{PRIVATE_NOTE} Niemand in de groep ziet hier iets van.</div>

      {settings.track_period && (
        <div className="card stack cycle-hero">
          {now ? (
            <>
              <div className="cycle-top">
                <span className="cycle-emoji">{PHASES[now.phase].emoji}</span>
                <div className="grow">
                  <div className="muted small">Dag {now.cycleDay} van je cyclus</div>
                  <h2>{PHASES[now.phase].label}</h2>
                </div>
              </div>
              <p className="small">{PHASES[now.phase].tip}</p>
              {next && <p className="muted small">Volgende menstruatie verwacht rond <b>{shortDate(next)}</b> · cyclus ±{info.avgCycle} dagen{info.measured ? '' : ' (aanname)'}</p>}
            </>
          ) : (
            <p className="muted">Vul de eerste dag van je laatste menstruatie in (tik op die dag in de kalender), dan rekent de app je cyclus uit.</p>
          )}
          <p className="muted tiny">Schatting op basis van je eigen gegevens. Geen anticonceptie of medisch advies.</p>
        </div>
      )}

      <div className="card cal">
        <div className="cal-nav">
          <button className="round" onClick={() => setMonth(prevMonth.slice(0, 7))} aria-label="Vorige maand">‹</button>
          <b className="cal-title">{monthName.format(f)}</b>
          <button className="round" onClick={() => setMonth(nextMonth.slice(0, 7))} aria-label="Volgende maand">›</button>
        </div>
        <div className="cal-grid">
          {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
          {cells.map((d) => {
            const bd = byDay[d];
            const mood = data.myMoods.find((m) => m.day === d);
            const cls = ['cal-day', 'body-day'];
            if (d.slice(0, 7) !== month) cls.push('out');
            if (d === t) cls.push('today');
            if (d === sel) cls.push('sel');
            if (bd?.period) cls.push('period');
            else if (predicted.has(d) && d > t) cls.push('predicted');
            return (
              <button key={d} className={cls.join(' ')} disabled={d > t && !predicted.has(d)} onClick={() => d <= t && setSel(d)}>
                <span className="cal-n">{fromISO(d).getDate()}</span>
                <span className="body-marks">
                  {bd?.sex && settings.track_sex && <i>💞</i>}
                  {mood && <i><MoodIcon score={mood.score} /></i>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted small">
          {settings.track_period && <span><i className="leg-period" /> menstruatie</span>}
          {settings.track_period && <span><i className="leg-pred" /> verwacht</span>}
          {settings.track_sex && <span>💞 seks</span>}
          <span>🙂 je mood</span>
        </div>
      </div>

      <DayForm key={sel} day={sel} existing={byDay[sel]} settings={settings} onSaved={reload} />

      {settings.track_period && (
        <div className="card stack">
          <h2>Inzichten</h2>
          {!enough || !insights ? (
            <p className="muted small">
              Houd een paar weken je mood en menstruatie bij. Dan zie je hier hoe je je voelt en hoe je je doelen haalt in elke fase van je cyclus. 🌱
            </p>
          ) : (
            <div className="insights">
              {PHASE_ORDER.map((p) => {
                const m = avg(insights[p].mood), g = avg(insights[p].goals);
                return (
                  <div key={p} className="ins-row">
                    <span className="ins-label">{PHASES[p].emoji} {PHASES[p].label.replace(' fase', '').replace('Rond de ', '')}</span>
                    <span className="ins-val">{m != null && insights[p].mood.length >= 2 ? <><MoodIcon score={Math.round(m)} /> {m.toFixed(1)}</> : '–'}</span>
                    <span className="ins-bar"><i style={{ width: `${(g ?? 0) * 100}%` }} /></span>
                    <span className="ins-pct">{g != null ? `${Math.round(g * 100)}%` : '–'}</span>
                  </div>
                );
              })}
              <p className="muted tiny">Mood = gemiddelde score (1–5). Balk = hoeveel van je dagelijkse doelen je haalde. Zie je een dip? Dat is je ritme, geen falen. 💜</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DayForm({ day, existing, settings, onSaved }: {
  day: string; existing?: BodyDay; settings: PrivateSettings; onSaved: () => Promise<void>;
}) {
  const { me } = useStore();
  const [period, setPeriod] = useState(existing?.period ?? false);
  const [flow, setFlow] = useState<Flow | null>(existing?.flow ?? null);
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);
  const [sex, setSex] = useState(existing?.sex ?? false);
  const [prot, setProt] = useState<boolean | null>(existing?.sex_protected ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const empty = !period && !sex && symptoms.length === 0 && !note.trim();
    const { error } = empty
      ? await supabase.from('body_days').delete().eq('user_id', me.id).eq('day', day)
      : await supabase.from('body_days').upsert({
        user_id: me.id, day, period, flow: period ? flow : null, symptoms,
        sex, sex_protected: sex ? prot : null, note: note.trim() || null, updated_at: new Date().toISOString(),
      });
    setBusy(false);
    if (error) return alert(errMsg(error));
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    await onSaved();
  }

  return (
    <div className="card stack">
      <h2>{relativeDay(day)}</h2>
      {settings.track_period && (
        <>
          <label className="share-row">
            <span className="grow"><b>🩸 Menstruatie</b></span>
            <span className="switch"><input type="checkbox" checked={period} onChange={(e) => setPeriod(e.target.checked)} /><span /></span>
          </label>
          {period && (
            <div className="segmented">
              {FLOWS.map((x) => <button key={x.id} type="button" className={flow === x.id ? 'on' : ''} onClick={() => setFlow(flow === x.id ? null : x.id)}>{x.label}</button>)}
            </div>
          )}
          <div className="field">
            <span>Klachten</span>
            <div className="chips">
              {SYMPTOMS.map((s) => (
                <button key={s} type="button" className={'chip' + (symptoms.includes(s) ? ' on' : '')}
                  onClick={() => setSymptoms((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{s}</button>
              ))}
            </div>
          </div>
        </>
      )}
      {settings.track_sex && (
        <>
          <label className="share-row">
            <span className="grow"><b>💞 Seks</b></span>
            <span className="switch"><input type="checkbox" checked={sex} onChange={(e) => setSex(e.target.checked)} /><span /></span>
          </label>
          {sex && (
            <div className="segmented">
              <button type="button" className={prot === true ? 'on' : ''} onClick={() => setProt(prot === true ? null : true)}>Beschermd</button>
              <button type="button" className={prot === false ? 'on' : ''} onClick={() => setProt(prot === false ? null : false)}>Onbeschermd</button>
            </div>
          )}
        </>
      )}
      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie (optioneel)" />
      <button className="btn" disabled={busy} onClick={save}>{saved ? 'Opgeslagen ✓' : busy ? 'Opslaan…' : 'Opslaan'}</button>
    </div>
  );
}
