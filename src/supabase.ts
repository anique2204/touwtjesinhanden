import { createClient } from '@supabase/supabase-js';

// Alleen het basisadres gebruiken: haal spaties, een eventuele "/rest/v1/" en slashes aan het eind weg.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/(rest|auth)\/v1\/?$/, '')
  .replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const configured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Leesbare foutmelding, ook voor rare gevallen (zoals een browser-Event). */
export function errMsg(e: unknown): string {
  if (typeof Event !== 'undefined' && e instanceof Event) {
    return 'Er ging iets mis met het laden van een bestand (meestal een foto). Probeer een andere foto of maak er een screenshot van.';
  }
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    if (/failed to fetch|network|load failed/i.test(m)) return 'Geen verbinding. Check je internet en probeer het opnieuw.';
    return m;
  }
  return String(e);
}
