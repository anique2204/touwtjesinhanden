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
                    {difficultyOf(h.difficulty).icon} {h.per_week >= 7 ? 'Elke dag' : `${h.per_week}× per week`}
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
  const [daily, setDaily] = useState((habit?.per_week ?? 7) >= 7);
  const [perWeek, setPerWeek] = useState(habit && habit.per_week < 7 ? habit.per_week : 3);
  const [priv, setPriv] = useState(habit?.is_private ?? false);
  const [difficulty, setDifficulty] = useState<Difficulty>(habit?.difficulty ?? 'normaal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const row = { title: title.trim(), emoji, per_week: daily ? 7 : perWeek, is_private: priv, difficulty };
    const write = (r: Partial<typeof row>) => habit
      ? supabase.from('habits').update(r).eq('id', habit.id)
      : supabase.from('habits').insert({ ...r, group_id: data.group.id });
    let { error } = await write(row);
    // Database nog niet bijgewerkt (geen kolom 'difficulty')? Dan zonder moeilijkheid opslaan.
    if (error && /difficulty/i.test(error.message)) {
      const { difficulty: _skip, ...rest } = row; void _skip;
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
            <button type="button" className={daily ? 'on' : ''} onClick={() => setDaily(true)}>Elke dag</button>
            <button type="button" className={!daily ? 'on' : ''} onClick={() => setDaily(false)}>Paar keer per week</button>
          </div>
          {!daily && (
            <div className="goal-editor">
              <button type="button" className="round" onClick={() => setPerWeek((x) => Math.max(1, x - 1))}>−</button>
              <div className="goal-n"><b>{perWeek}×</b><span>per week</span></div>
              <button type="button" className="round" onClick={() => setPerWeek((x) => Math.min(6, x + 1))}>+</button>
            </div>
          )}
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
