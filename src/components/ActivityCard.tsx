import { useEffect, useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import { SPORTS, type Activity } from '../types';
import { formatDuration, pace, relativeDay, timeAgo } from '../dates';
import Avatar from './Avatar';
import AddActivity from '../pages/AddActivity';

const urlCache = new Map<string, string>();

function usePhoto(path: string | null) {
  const [url, setUrl] = useState<string | null>(path ? urlCache.get(path) ?? null : null);
  useEffect(() => {
    if (!path || urlCache.has(path)) return;
    let alive = true;
    supabase.storage.from('photos').createSignedUrl(path, 60 * 60 * 6).then(({ data }) => {
      if (data?.signedUrl && alive) { urlCache.set(path, data.signedUrl); setUrl(data.signedUrl); }
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}

export default function ActivityCard({ a }: { a: Activity }) {
  const { me, data, reload } = useStore();
  const p = data.profiles[a.user_id];
  const photo = usePhoto(a.photo_path);
  const kudos = data.kudos.filter((k) => k.activity_id === a.id);
  const comments = data.comments.filter((c) => c.activity_id === a.id);
  const iGave = kudos.some((k) => k.user_id === me.id);
  const mine = a.user_id === me.id;
  const [showComments, setShowComments] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [editing, setEditing] = useState(false);

  const sport = SPORTS[a.sport];
  const title = a.label?.trim() || sport.label;

  async function toggleKudo() {
    if (mine) return;
    setBusy(true);
    if (iGave) await supabase.from('kudos').delete().eq('activity_id', a.id).eq('user_id', me.id);
    else await supabase.from('kudos').insert({ activity_id: a.id });
    await reload(); setBusy(false);
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({ activity_id: a.id, body: text.trim() });
    if (error) alert(errMsg(error)); else setText('');
    await reload(); setBusy(false);
  }

  async function remove() {
    if (!confirm('Deze training verwijderen?')) return;
    if (a.photo_path) await supabase.storage.from('photos').remove([a.photo_path]);
    const { error } = await supabase.from('activities').delete().eq('id', a.id);
    if (error) alert(errMsg(error));
    await reload();
  }

  return (
    <article className="card activity">
      <header className="act-head">
        <Avatar p={p} />
        <div className="grow">
          <div className="name">{p?.display_name ?? 'Onbekend'}</div>
          <div className="muted small">{relativeDay(a.activity_date)} · {timeAgo(a.created_at)}</div>
        </div>
      </header>

      <h3 className="act-title">{sport.emoji} {title} {a.is_pr && <span className="badge pr">🏆 PR</span>}</h3>
      <div className="stats">
        <div><b>{formatDuration(a.duration_min)}</b><span>duur</span></div>
        {a.distance_km != null && <div><b>{Number(a.distance_km).toLocaleString('nl-NL')} km</b><span>afstand</span></div>}
        {a.distance_km != null && a.sport === 'hardlopen' && <div><b>{pace(a.duration_min, Number(a.distance_km))}</b><span>tempo</span></div>}
      </div>
      {a.notes && <p className="notes">{a.notes}</p>}
      {a.photo_path && (photo
        ? <img className="photo" src={photo} alt="" loading="lazy" onClick={() => setZoom(true)} />
        : <div className="photo placeholder" />)}

      <footer className="act-foot">
        <button className={'chip' + (iGave ? ' on' : '')} disabled={busy || mine} onClick={toggleKudo}
          title={mine ? 'Je kunt jezelf geen kudos geven' : 'Kudos'}>
          👏 {kudos.length || ''}
        </button>
        <button className={'chip' + (showComments ? ' on' : '')} onClick={() => setShowComments((s) => !s)}>
          💬 {comments.length || ''}
        </button>
        <div className="grow" />
        {kudos.length > 0 && (
          <span className="muted small">
            {kudos.map((k) => data.profiles[k.user_id]?.display_name).filter(Boolean).join(', ')}
          </span>
        )}
        {mine && <button className="link small" onClick={() => setEditing(true)}>Wijzig</button>}
        {mine && <button className="link danger small" onClick={remove}>Verwijder</button>}
      </footer>

      {showComments && (
        <div className="comments">
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <Avatar p={data.profiles[c.user_id]} size={24} />
              <div className="grow">
                <b>{data.profiles[c.user_id]?.display_name}</b> {c.body}
                <div className="muted small">{timeAgo(c.created_at)}
                  {c.user_id === me.id && (
                    <button className="link small" onClick={async () => {
                      await supabase.from('comments').delete().eq('id', c.id); await reload();
                    }}> · verwijder</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <form onSubmit={addComment} className="comment-form">
            <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Reageer…" />
            <button className="btn small" disabled={busy || !text.trim()}>Stuur</button>
          </form>
        </div>
      )}

      {editing && (
        <div className="overlay-page">
          <div className="overlay-inner">
            <AddActivity edit={a} editPhotoUrl={photo} onCancel={() => setEditing(false)}
              onDone={() => { if (a.photo_path) urlCache.delete(a.photo_path); setEditing(false); }} />
          </div>
        </div>
      )}

      {zoom && photo && (
        <div className="lightbox" onClick={() => setZoom(false)}><img src={photo} alt="" /></div>
      )}
    </article>
  );
}
