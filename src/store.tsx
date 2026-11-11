import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Activity, Challenge, Cheer, Comment, Group, Habit, HabitCheck, Kudo, Member, Mood, PauseDay, Profile, SharedMood, WeeklyGoal } from './types';
import { today } from './dates';

export interface GroupData {
  group: Group;
  members: Member[];
  profiles: Record<string, Profile>;
  challenges: Challenge[];
  goals: WeeklyGoal[];
  activities: Activity[];
  kudos: Kudo[];
  comments: Comment[];
  habits: Habit[];
  checks: HabitCheck[];
  cheers: Cheer[];
  pauses: PauseDay[];
  sharedMoods: SharedMood[];   // gedeelde gezichtjes van iedereen
  myMoods: Mood[];             // je eigen moods, met labels en notitie
}

interface Ctx {
  session: Session;
  me: Profile;
  data: GroupData;
  isAdmin: boolean;
  currentChallenge: Challenge | null;
  reload: () => Promise<void>;
  patch: (fn: (d: GroupData) => GroupData) => void;
  setMe: (p: Profile) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore buiten provider');
  return c;
}

async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export async function loadGroupData(groupId: string): Promise<GroupData> {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user.id ?? '';
  const [group, members, challenges, activities, kudos, comments, habits, checks, cheers, pauses, sharedMoods, myMoods] = await Promise.all([
    must<Group>(supabase.from('groups').select('*').eq('id', groupId).single()),
    must<Member[]>(supabase.from('group_members').select('*').eq('group_id', groupId)),
    must<Challenge[]>(supabase.from('challenges').select('*').eq('group_id', groupId).order('start_date', { ascending: false })),
    must<Activity[]>(supabase.from('activities').select('*').eq('group_id', groupId)
      .order('activity_date', { ascending: false }).order('created_at', { ascending: false })),
    must<Kudo[]>(supabase.from('kudos').select('activity_id, user_id, activities!inner(group_id)').eq('activities.group_id', groupId)),
    must<Comment[]>(supabase.from('comments').select('id, activity_id, user_id, body, created_at, activities!inner(group_id)')
      .eq('activities.group_id', groupId).order('created_at')),
    // Doelen/vinkjes/high fives: als de database-update nog niet is gedraaid, gewoon leeg laten.
    supabase.rpc('group_habits', { gid: groupId }).then(({ data }) => (data ?? []) as Habit[]),
    supabase.from('habit_checks').select('*').eq('group_id', groupId)
      .then(({ data }) => (data ?? []) as HabitCheck[]),
    supabase.from('cheers').select('*').eq('group_id', groupId)
      .then(({ data }) => ((data ?? []) as Cheer[]).map((c) => ({ ...c, kind: c.kind ?? 'highfive' }))),
    supabase.from('pause_days').select('user_id, group_id, day').eq('group_id', groupId)
      .then(({ data }) => (data ?? []) as PauseDay[]),
    supabase.rpc('group_moods', { gid: groupId }).then(({ data }) => (data ?? []) as SharedMood[]),
    supabase.from('moods').select('*').eq('user_id', myId).eq('group_id', groupId)
      .then(({ data }) => (data ?? []) as Mood[]),
  ]);
  const ids = members.map((m) => m.user_id);
  const [profiles, goals] = await Promise.all([
    must<Profile[]>(supabase.from('profiles').select('*').in('id', ids)),
    challenges.length
      ? must<WeeklyGoal[]>(supabase.from('weekly_goals').select('*').in('challenge_id', challenges.map((c) => c.id)))
      : Promise.resolve([] as WeeklyGoal[]),
  ]);
  // Profielfoto's: tijdelijke links ophalen (lukt dit niet, dan gewoon de letter tonen)
  const avatarPaths = profiles.map((p) => p.avatar_path).filter((x): x is string => Boolean(x));
  if (avatarPaths.length) {
    const { data: signed } = await supabase.storage.from('avatars').createSignedUrls(avatarPaths, 60 * 60 * 24);
    const urls = Object.fromEntries((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path, s.signedUrl]));
    for (const p of profiles) p.avatar_url = p.avatar_path ? urls[p.avatar_path] ?? null : null;
  }
  return {
    group, members, challenges, goals, activities, habits, checks, cheers, pauses, sharedMoods, myMoods,
    kudos: kudos.map(({ activity_id, user_id }) => ({ activity_id, user_id })),
    comments: comments.map(({ id, activity_id, user_id, body, created_at }) => ({ id, activity_id, user_id, body, created_at })),
    profiles: Object.fromEntries(profiles.map((p) => [p.id, p])),
  };
}

export function pickCurrentChallenge(challenges: Challenge[]): Challenge | null {
  const t = today();
  return (
    challenges.find((c) => c.start_date <= t && c.end_date >= t) ??
    challenges.filter((c) => c.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ??
    challenges[0] ??
    null
  );
}

export function StoreProvider(props: {
  session: Session; me: Profile; initial: GroupData; setMe: (p: Profile) => void; children: ReactNode;
}) {
  const [data, setData] = useState<GroupData>(props.initial);
  const groupId = props.initial.group.id;

  const reload = useCallback(async () => {
    setData(await loadGroupData(groupId));
  }, [groupId]);

  useEffect(() => {
    let timer: number | undefined;
    const soon = () => { clearTimeout(timer); timer = window.setTimeout(() => void reload().catch(() => {}), 400); };
    const ch = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kudos' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_checks', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheers', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pause_days', filter: `group_id=eq.${groupId}` }, soon)
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') soon(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [groupId, reload]);

  const value = useMemo<Ctx>(() => ({
    session: props.session,
    me: props.me,
    data,
    isAdmin: data.members.some((m) => m.user_id === props.me.id && m.role === 'admin'),
    currentChallenge: pickCurrentChallenge(data.challenges),
    reload,
    patch: (fn) => setData((d) => fn(d)),
    setMe: props.setMe,
  }), [props.session, props.me, props.setMe, data, reload]);

  return <StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider>;
}
