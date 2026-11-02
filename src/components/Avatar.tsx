import type { Profile } from '../types';

export default function Avatar({ p, size = 36 }: { p?: Profile; size?: number }) {
  const initial = (p?.display_name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ background: p?.color ?? '#9ca3af', width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </span>
  );
}
