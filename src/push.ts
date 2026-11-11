import { supabase } from './supabase';

// Publieke VAPID-sleutel (mag openbaar zijn; de geheime helft staat alleen bij Supabase)
export const VAPID_PUBLIC_KEY = 'BIzTvOVVZDCLZ4v133zIIszjZZOoVTRApo1QM23xW7S4nmqOU_ZMzzsscc6M62FfBJi__nPFJFzzw-xO45cdaiY';

export const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

/** Huidig abonnement op dit toestel (of null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Vraag toestemming en meld dit toestel aan voor meldingen. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Dit toestel of deze browser ondersteunt geen meldingen.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Je hebt geen toestemming gegeven. Zet meldingen voor LockedIn aan in de instellingen van je telefoon.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) as BufferSource });
  }
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

/** Meld dit toestel af. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function callNotify(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('notify', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((x: { error?: string }) => x.error).catch(() => null) : null;
    throw new Error(msg || error.message);
  }
  return data as Record<string, unknown>;
}
