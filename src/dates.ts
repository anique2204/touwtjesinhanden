// Alle datums als 'YYYY-MM-DD' in lokale tijd. Weken lopen van maandag t/m zondag.

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = (): string => toISO(new Date());

export function addDays(s: string, n: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function mondayOf(s: string): string {
  const d = fromISO(s);
  const dow = (d.getDay() + 6) % 7; // ma=0
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

const fmtShort = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

export const shortDate = (s: string) => fmtShort.format(fromISO(s));

export function relativeDay(s: string): string {
  const diff = daysBetween(s, today());
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Gisteren';
  if (diff === 2) return 'Eergisteren';
  return fmtLong.format(fromISO(s));
}

export function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'zojuist';
  if (sec < 3600) return `${Math.floor(sec / 60)} min geleden`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} uur geleden`;
  return `${Math.floor(sec / 86400)} d geleden`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}u ${m}m` : `${h} uur`;
}

export function pace(min: number, km: number): string {
  const secPerKm = (min * 60) / km;
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}
