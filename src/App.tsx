import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, errMsg, supabase } from './supabase';
import type { Profile } from './types';
import { loadGroupData, StoreProvider, type GroupData } from './store';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import GroupSetup from './pages/GroupSetup';
import Shell from './pages/Shell';

const JOIN_KEY = 'touwtjes.pendingJoin';
const GROUP_KEY = 'touwtjes.activeGroup';

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ }
}

// Uitnodigingslink: /?join=CODE  → onthouden tot na het inloggen
(() => {
  const code = new URLSearchParams(window.location.search).get('join');
  if (code) {
    safeSet(JOIN_KEY, code);
    window.history.replaceState(null, '', window.location.pathname);
  }
})();

type Phase =
  | { k: 'loading' }
  | { k: 'error'; msg: string }
  | { k: 'login' }
  | { k: 'profile'; session: Session }
  | { k: 'group'; session: Session; me: Profile }
  | { k: 'ready'; session: Session; me: Profile; data: GroupData };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => safeGet(JOIN_KEY));
  const joinRef = useRef(pendingJoin);
  joinRef.current = pendingJoin;

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 'init' = nog aan het laden, 'out' = niet ingelogd, anders het gebruikers-id
  const authKey = session === undefined ? 'init' : session === null ? 'out' : session.user.id;

  const resolve = useCallback(async (s: Session) => {
    if (s.user.email) safeSet('lockedin.email', s.user.email);
    try {
      const { data: me, error } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
      if (error) throw error;
      if (!me) return setPhase({ k: 'profile', session: s });
      const { data: memberships, error: mErr } = await supabase
        .from('group_members').select('group_id, joined_at').eq('user_id', s.user.id).order('joined_at');
      if (mErr) throw mErr;
      if (!memberships?.length || joinRef.current) return setPhase({ k: 'group', session: s, me });
      const stored = safeGet(GROUP_KEY);
      const gid = memberships.find((m) => m.group_id === stored)?.group_id ?? memberships[0].group_id;
      const data = await loadGroupData(gid);
      setPhase({ k: 'ready', session: s, me, data });
    } catch (e) {
      setPhase({ k: 'error', msg: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) { setPhase({ k: 'login' }); return; }
    setPhase((p) => (p.k === 'ready' && p.session.user.id === session.user.id ? { ...p, session } : p));
    void resolve(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  const setMe = useCallback((me: Profile) => {
    setPhase((p) => (p.k === 'ready' ? { ...p, me } : p));
  }, []);

  if (!configured) {
    return (
      <div className="center-page">
        <div className="card">
          <h1>Nog niet gekoppeld</h1>
          <p className="muted">
            Zet <code>VITE_SUPABASE_URL</code> en <code>VITE_SUPABASE_ANON_KEY</code> in de omgevingsvariabelen
            (lokaal in <code>.env</code>, online in Vercel) en bouw opnieuw.
          </p>
        </div>
      </div>
    );
  }

  switch (phase.k) {
    case 'loading':
      return <div className="center-page"><div className="spinner" /></div>;
    case 'error':
      return (
        <div className="center-page">
          <div className="card">
            <h1>Er ging iets mis</h1>
            <p className="error">{phase.msg}</p>
            <button className="btn" onClick={() => session && resolve(session)}>Opnieuw proberen</button>
            <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Uitloggen</button>
          </div>
        </div>
      );
    case 'login':
      return <Login hasInvite={Boolean(pendingJoin)} />;
    case 'profile':
      return <ProfileSetup session={phase.session} onDone={() => resolve(phase.session)} />;
    case 'group':
      return (
        <GroupSetup
          me={phase.me}
          inviteCode={pendingJoin}
          onDone={(gid) => {
            safeSet(JOIN_KEY, null);
            joinRef.current = null;
            setPendingJoin(null);
            if (gid) safeSet(GROUP_KEY, gid);
            setPhase({ k: 'loading' });
            void resolve(phase.session);
          }}
        />
      );
    case 'ready':
      return (
        <StoreProvider key={phase.data.group.id} session={phase.session} me={phase.me} initial={phase.data} setMe={setMe}>
          <Shell />
        </StoreProvider>
      );
  }
}
