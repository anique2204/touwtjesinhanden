import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Activity, Challenge, Comment, Group, Kudo, Member, Profile, WeeklyGoal } from './types';
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
}

interface Ctx {
  session: Session;
  me: Profile;
  data: GroupData;
  isAdmin: boolean;
  currentChallenge: Challenge | null;
  reload: () => Promise<void>;
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
  const [group, members, challenges, activities, kudos, comments] = await Promise.all([
    must<Group>(supabase.from('groups').select('*').eq('id', groupId).single()),
    must<Member[]>(supabase.from('group_members').select('*').eq('group_id', groupId)),
    must<Challenge[]>(supabase.from('challenges').select('*').eq('group_id', groupId).order('start_date', { ascending: false })),
    must<Activity[]>(supabase.from('activities').select('*').eq('group_id', groupId)
      .order('activity_date', { ascending: false }).order('created_at', { ascending: false })),
    must<Kudo[]>(supabase.from('kudos').select('activity_id, user_id, activities!inner(group_id)').eq('activities.group_id', groupId)),
    must<Comment[]>(supabase.from('comments').select('id, activity_id, user_id, body, created_at, activities!inner(group_id)')
      .eq('activities.group_id', groupId).order('created_at')),
  ]);
  const ids = members.map((m) => m.user_id);
  const [profiles, goals] = await Promise.all([
    must<Profile[]>(supabase.from('profiles').select('*').in('id', ids)),
    challenges.length
      ? must<WeeklyGoal[]>(supabase.from('weekly_goals').select('*').in('challenge_id', challenges.map((c) => c.id)))
      : Promise.resolve([] as WeeklyGoal[]),
  ]);
  return {
    group, members, challenges, goals, activities,
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
    setMe: props.setMe,
  }), [props.session, props.me, props.setMe, data, reload]);

  return <StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider>;
}
