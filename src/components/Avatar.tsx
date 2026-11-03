import { useState } from 'react';
import type { Profile } from '../types';

export default function Avatar({ p, size = 36 }: { p?: Profile; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (p?.display_name ?? '?').trim().charAt(0).toUpperCase();
  const style = { background: p?.color ?? '#9ca3af', width: size, height: size, fontSize: size * 0.45 };
  if (p?.avatar_url && !broken) {
    return <img className="avatar img" src={p.avatar_url} alt={p.display_name} style={style} onError={() => setBroken(true)} />;
  }
  return <span className="avatar" style={style}>{initial}</span>;
}
