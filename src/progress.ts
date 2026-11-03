import { supabase } from './supabase';
import { POSES, photoOf, type Measurement } from './types';

export const BUCKET = 'progress';

export async function loadMeasurements(userId: string): Promise<Measurement[]> {
  const { data, error } = await supabase.from('measurements').select('*')
    .eq('user_id', userId).order('measured_on').order('created_at');
  if (error) throw error;
  return (data ?? []).map((m) => ({
    ...m,
    weight_kg: m.weight_kg == null ? null : Number(m.weight_kg),
    waist_cm: m.waist_cm == null ? null : Number(m.waist_cm),
    belly_cm: m.belly_cm == null ? null : Number(m.belly_cm),
  }));
}

/** Tijdelijke links (1 uur) naar je eigen foto's, in één keer opgehaald. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export function allPhotoPaths(ms: Measurement[]): string[] {
  return ms.flatMap((m) => POSES.map((p) => photoOf(m, p.id)).filter((x): x is string => Boolean(x)));
}

export const fmt = (n: number | null, unit: string) =>
  n == null ? '–' : `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;

export function diff(a: number | null, b: number | null, unit: string): string {
  if (a == null || b == null) return '–';
  const d = Math.round((b - a) * 10) / 10;
  if (d === 0) return `± 0 ${unit}`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
}

/** Eerste en laatste meting waarin een waarde is ingevuld. */
export function firstLast<K extends 'weight_kg' | 'waist_cm' | 'belly_cm'>(ms: Measurement[], k: K) {
  const withVal = ms.filter((m) => m[k] != null);
  return { first: withVal[0] ?? null, last: withVal.length > 1 ? withVal[withVal.length - 1] : null };
}
