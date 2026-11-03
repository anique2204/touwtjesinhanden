import { useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { MOOD_TAGS, MOODS, moodEmoji } from '../types';
import { today } from '../dates';

/** Dagelijkse mood: gezichtje (eventueel delen), labels en notitie altijd privé. */
export default function MoodCheckin() {
  const { me, data, reload } = useStore();
  const t = today();
  const existing = data.myMoods.find((m) => m.day === t);
  const lastShared = [...data.myMoods].sort((a, b) => b.day.localeCompare(a.day))[0]?.shared ?? false;

  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(existing?.score ?? null);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [shared, setShared] = useState(existing?.shared ?? lastShared);
  const [busy, setBusy] = useState(false);

  function pick(s: number) {
    setScore(s);
    setOpen(true);
  }

  async function save() {
    if (score == null) return;
    setBusy(true);
    const { error } = await supabase.from('moods').upsert({
      user_id: me.id, group_id: data.group.id, day: t, score, tags, note: note.trim() || null, shared,
    });
    setBusy(false);
    if (error) return alert(errMsg(error));
    setOpen(false);
    await reload();
  }

  if (existing && !open) {
    const m = MOODS.find((x) => x.score === existing.score);
    return (
      <section className="card mood-done">
        <span className="mood-big">{moodEmoji(existing.score)}</span>
        <div className="grow">
          <b>Vandaag: {m?.label}</b>
          <div className="muted small">
            {existing.shared ? '👀 gezichtje gedeeld met de groep' : '🔒 alleen voor jou'}
            {existing.tags.length > 0 && ` · ${existing.tags.join(', ')}`}
          </div>
        </div>
        <button className="link small" onClick={() => {
          setScore(existing.score); setTags(existing.tags); setNote(existing.note ?? ''); setShared(existing.shared); setOpen(true);
        }}>Wijzig</button>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h2>Hoe voel je je vandaag?</h2>
      <div className="mood-row">
        {MOODS.map((m) => (
          <button key={m.score} className={'mood-btn' + (score === m.score ? ' on' : '')} onClick={() => pick(m.score)}>
            <span>{m.emoji}</span><small>{m.label}</small>
          </button>
        ))}
      </div>

      {open && score != null && (
        <>
          <div className="chips">
            {MOOD_TAGS.map((tag) => (
              <button key={tag} type="button" className={'chip' + (tags.includes(tag) ? ' on' : '')}
                onClick={() => setTags((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]))}>{tag}</button>
            ))}
          </div>
          <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wil je er iets over kwijt? (alleen voor jou)" />
          <label className="share-row">
            <span className="grow">
              <b>Deel mijn gezichtje met de groep</b>
              <span className="muted small">De groep ziet alleen {moodEmoji(score)}, nooit je labels of notitie.</span>
            </span>
            <span className="switch">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              <span />
            </span>
          </label>
          <div className="row2">
            <button className="btn ghost" onClick={() => { setOpen(false); if (!existing) setScore(null); }}>Annuleer</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
          </div>
        </>
      )}
    </section>
  );
}
