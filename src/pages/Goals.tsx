import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { DIFFICULTIES, difficultyOf, EMOJIS, HABIT_IDEAS, type Difficulty, type Habit } from '../types';
import { today } from '../dates';
import { habitActiveOn, habitStreak, pauseSet } from '../points';
import GoalEditor from '../components/GoalEditor';

export default function Goals({ back }: { back: () => void }) {
  const { me, data, reload, currentChallenge: c } = useStore();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const t = today();
  const mine = data.habits.filter((h) => h.user_id === me.id);
  const active = mine.filter((h) => habitActiveOn(h, t) || h.start_date > t);
  const stopped = mine.filter((h) => h.archived_on && h.archived_on <= t);
  const tg = c && data.goals.find((g) => g.user_id === me.id && g.challenge_id === c.id);
  const [trainingOn, setTrainingOn] = useState(Boolean(tg));

  async function stop(h: Habit) {
    if (!confirm(`Stoppen met “${h.title}”? Je vinkjes en punten blijven bewaard.`)) return;
    const { error } = await supabase.from('habits').update({ archived_on: t }).eq('id', h.id);
    if (error) alert(errMsg(error));
    await reload();
  }
  async function restart(h: Habit) {
    const { error } = await supabase.from('habits').update({ archived_on: null }).eq('id', h.id);
    if (error) alert(errMsg(error));
    await reload();
  }
  async function trainingOff() {
    if (!c || !tg) { setTrainingOn(false); return; }
    if (!confirm('Trainingsdoel uitzetten? Je trainingen blijven gewoon staan.')) return;
    const { error } = await supabase.from('weekly_goals').delete().eq('challenge_id', c.id).eq('user_id', me.id);
    if (error) alert(errMsg(error));
    setTrainingOn(false);
    await reload();
  }

  if (editing) return <GoalForm habit={editing === 'new' ? null : editing} onDone={async () => { setEditing(null); await reload(); }} onCancel={() => setEditing(null)} />;

  return (
    <div className="stack">
      <header className="page-head">
        <button className="link" onClick={back}>‹ Terug</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>Mijn doelen</h1>
        <span style={{ width: 52 }} />
      </header>

      <p className="muted small">
        Kies 3 à 5 doelen die je nu nog <b>niet</b> vanzelf doet. Met minder dan 3 doelen verdien je naar verhouding minder punten. 🌱
      </p>

      <button className="btn big" onClick={() => setEditing('new')}>＋ Nieuw doel</button>

      {active.length > 0 && (
        <div className="card list">
          {active.map((h) => {
            const st = habitStreak(h, data.checks, pauseSet(data.pauses, me.id));
            return (
              <div key={h.id} className="goal-row">
                <span className="h-emoji">{h.emoji}</span>
                <div className="grow">
                  <div className="name">{h.title} {h.is_private && <span className="lock">🔒</span>}</div>
                  <div className="muted small">
                    {difficultyOf(h.difficulty).icon} {(h.per_day ?? 1) > 1 ? `${h.per_day}× per dag` : h.per_week >= 7 ? 'Elke dag' : `${h.per_week}× per week`}{h.options?.length ? ' · keuzedoel' : ''}{h.reminder_times?.length ? ` · 🔔 ${h.reminder_times.join(', ')}` : ''}
                    {h.is_private ? ' · privé' : ' · zichtbaar voor de groep'}
                    {st.n > 0 && ` · 🔥 ${st.n}`}
                  </div>
                </div>
                <button className="link small" onClick={() => setEditing(h)}>Wijzig</button>
                <button className="link small danger" onClick={() => stop(h)}>Stop</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="card stack">
        <div className="goal-row">
          <span className="h-emoji">💪</span>
          <div className="grow">
            <div className="name">Trainen</div>
            <div className="muted small">Telt je gelogde trainingen per week{c ? ` (${c.name})` : ''}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={trainingOn} onChange={(e) => (e.target.checked ? setTrainingOn(true) : void trainingOff())} />
            <span />
          </label>
        </div>
        {trainingOn && c && <GoalEditor challenge={c} />}
      </div>

      {stopped.length > 0 && (
        <details className="card">
          <summary className="muted">Gestopte doelen ({stopped.length})</summary>
          <div className="list" style={{ marginTop: 8 }}>
            {stopped.map((h) => (
              <div key={h.id} className="goal-row">
                <span className="h-emoji">{h.emoji}</span>
                <span className="grow">{h.title}</span>
                <button className="link small" onClick={() => restart(h)}>Weer starten</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function GoalForm({ habit, onDone, onCancel }: { habit: Habit | null; onDone: () => void; onCancel: () => void }) {
  const { data } = useStore();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '🎯');
  const [custom, setCustom] = useState(habit && !EMOJIS.includes(habit.emoji) ? habit.emoji : '');

  /** Pak het laatst getypte teken (één emoji, ook samengestelde zoals 👩‍❤️‍👨). */
  function pickCustom(v: string) {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    const parts = Seg ? [...new Seg('nl', { granularity: 'grapheme' }).segment(v)].map((x) => x.segment) : Array.from(v);
    const last = parts.filter((p) => p.trim()).pop() ?? '';
    setCustom(last);
    if (last && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(last)) setEmoji(last);
  }
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'multi'>(
    (habit?.per_day ?? 1) > 1 ? 'multi' : (habit?.per_week ?? 7) >= 7 ? 'daily' : 'weekly');
  const setDaily = (d: boolean) => setFreq(d ? 'daily' : 'weekly');
  const daily = freq !== 'weekly';
  const [perWeek, setPerWeek] = useState(habit && habit.per_week < 7 ? habit.per_week : 3);
  const [perDayN, setPerDayN] = useState(Math.max(2, habit?.per_day ?? 3));
  const [isChoice, setIsChoice] = useState(Boolean(habit?.options?.length));
  const [options, setOptions] = useState<string[]>(habit?.options ?? []);
  const [newOption, setNewOption] = useState('');
  const [reminders, setReminders] = useState<string[]>(habit?.reminder_times ?? []);

  function addOption() {
    const o = newOption.trim();
    if (o && !options.includes(o) && options.length < 8) setOptions([...options, o]);
    setNewOption('');
  }
  const [priv, setPriv] = useState(habit?.is_private ?? false);
  const [difficulty, setDifficulty] = useState<Difficulty>(habit?.difficulty ?? 'normaal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    if (isChoice && options.length < 2) { setBusy(false); setError('Geef minstens 2 keuzes op, of zet "keuzedoel" uit.'); return; }
    const row = {
      title: title.trim(), emoji, per_week: daily ? 7 : perWeek, is_private: priv, difficulty,
      per_day: freq === 'multi' ? perDayN : 1,
      options: isChoice && freq !== 'multi' ? options : [],
      reminder_times: [...new Set(reminders.filter(Boolean))].sort(),
    };
    const write = (r: Partial<typeof row>) => habit
      ? supabase.from('habits').update(r).eq('id', habit.id)
      : supabase.from('habits').insert({ ...r, group_id: data.group.id });
    let { error } = await write(row);
    // Database nog niet bijgewerkt (geen kolom 'difficulty')? Dan zonder moeilijkheid opslaan.
    if (error && /difficulty|per_day|options|reminder_times/i.test(error.message)) {
      const { difficulty: _a, per_day: _b, options: _c, reminder_times: _d, ...rest } = row; void _a; void _b; void _c; void _d;
      ({ error } = await write(rest));
    }
    setBusy(false);
    if (error) setError(errMsg(error)); else onDone();
  }

  return (
    <form className="stack" onSubmit={save}>
      <header className="page-head">
        <button type="button" className="link" onClick={onCancel}>‹ Annuleer</button>
        <h1 className="grow" style={{ textAlign: 'center' }}>{habit ? 'Doel wijzigen' : 'Nieuw doel'}</h1>
        <span style={{ width: 70 }} />
      </header>

      {!habit && (
        <div className="card stack">
          <span className="field-label">Ideeën</span>
          <div className="chips">
            {HABIT_IDEAS.map((i) => (
              <button type="button" key={i.title} className={'chip' + (title === i.title ? ' on' : '')}
                onClick={() => { setTitle(i.title); setEmoji(i.emoji); setDaily(i.per_week >= 7); if (i.per_week < 7) setPerWeek(i.per_week); }}>
                {i.emoji} {i.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <label className="field"><span>Wat wil je volhouden?</span>
          <input required maxLength={50} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. 2 liter water" />
        </label>
        <div className="field">
          <span>Icoon</span>
          <div className="emoji-grid">
            {EMOJIS.map((em) => (
              <button type="button" key={em} className={'emoji-btn' + (emoji === em ? ' on' : '')} onClick={() => setEmoji(em)}>{em}</button>
            ))}
          </div>
          <div className="own-emoji">
            <span className="own-emoji-preview">{emoji}</span>
            <input value={custom} onChange={(e) => pickCustom(e.target.value)} placeholder="Of typ je eigen emoji 😊" aria-label="Eigen emoji" />
          </div>
          <span className="muted small">Tik in het vak en kies een emoji via je toetsenbord (🙂-knop of 🌐).</span>
        </div>
        <div className="field">
          <span>Hoe vaak?</span>
          <div className="segmented">
            <button type="button" className={freq === 'daily' ? 'on' : ''} onClick={() => setFreq('daily')}>Elke dag</button>
            <button type="button" className={freq === 'multi' ? 'on' : ''} onClick={() => setFreq('multi')}>Vaker per dag</button>
            <button type="button" className={freq === 'weekly' ? 'on' : ''} onClick={() => setFreq('weekly')}>Paar × per week</button>
          </div>
          {freq === 'multi' && (
            <div className="goal-editor">
              <button type="button" className="round" onClick={() => setPerDayN((x) => Math.max(2, x - 1))}>−</button>
              <div className="goal-n"><b>{perDayN}×</b><span>per dag</span></div>
              <button type="button" className="round" onClick={() => setPerDayN((x) => Math.min(10, x + 1))}>+</button>
            </div>
          )}
          {!daily && (
            <div className="goal-editor">
              <button type="button" className="round" onClick={() => setPerWeek((x) => Math.max(1, x - 1))}>−</button>
              <div className="goal-n"><b>{perWeek}×</b><span>per week</span></div>
              <button type="button" className="round" onClick={() => setPerWeek((x) => Math.min(6, x + 1))}>+</button>
            </div>
          )}
        </div>
        {freq !== 'multi' && (
          <div className="field">
            <label className="share-row">
              <span className="grow">
                <b>🔀 Keuzedoel</b>
                <span className="muted small">Eén van de keuzes doen is genoeg, bijv. handstand óf springen óf lymfemassage.</span>
              </span>
              <span className="switch"><input type="checkbox" checked={isChoice} onChange={(e) => setIsChoice(e.target.checked)} /><span /></span>
            </label>
            {isChoice && (
              <>
                <div className="chips">
                  {options.map((o) => (
                    <button type="button" key={o} className="chip on" onClick={() => setOptions(options.filter((x) => x !== o))} title="Weghalen">{o} ✕</button>
                  ))}
                </div>
                <div className="own-emoji">
                  <input value={newOption} maxLength={30} onChange={(e) => setNewOption(e.target.value)} placeholder="Keuze toevoegen, bijv. handstand"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} />
                  <button type="button" className="btn small" onClick={addOption} disabled={!newOption.trim()}>＋</button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="field">
          <span>🔔 Herinneringen (optioneel)</span>
          <div className="chips">
            {reminders.map((t, i) => (
              <span key={i} className="time-chip">
                <input type="time" value={t} onChange={(e) => setReminders(reminders.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className="link small danger" onClick={() => setReminders(reminders.filter((_, j) => j !== i))} aria-label="Weghalen">✕</button>
              </span>
            ))}
            {reminders.length < 6 && (
              <button type="button" className="chip" onClick={() => setReminders([...reminders, reminders.length ? '14:00' : '10:00'])}>＋ tijd</button>
            )}
          </div>
          <span className="muted small">Je krijgt alleen een melding als je het doel nog niet (helemaal) gedaan hebt. Werkt zodra je meldingen aanzet bij Ik → Meldingen.</span>
        </div>
        <div className="field">
          <span>Hoe moeilijk is dit voor jóu?</span>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button type="button" key={d.id} className={difficulty === d.id ? 'on' : ''} onClick={() => setDifficulty(d.id)}>
                {d.icon} {d.label}
              </button>
            ))}
          </div>
          <span className="muted small">
            {difficulty === 'makkelijk' && 'Doe je het meestal al? Dan is het makkelijk. Telt als ½ doel en weegt lichter mee.'}
            {difficulty === 'normaal' && 'Lukt meestal, maar je moet er wel moeite voor doen.'}
            {difficulty === 'moeilijk' && 'Echt een uitdaging. Telt als 1½ doel en weegt zwaarder mee. De groep ziet dit label.'}
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          <span>🔒 Privé: de groep ziet alleen <i>dat</i> je iets hebt afgevinkt, niet wat</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy || !title.trim()}>{habit ? 'Opslaan' : 'Doel toevoegen'}</button>
    </form>
  );
}
