import type { Activity, Challenge, WeeklyGoal } from './types';
import { addDays, daysBetween, mondayOf, today } from './dates';

// ---- Puntenregels (hier aanpassen als de groep andere regels wil) ----
export const RULES = {
  perMinute: 1,          // 1 punt per minuut training
  weekGoal: 50,          // weekdoel gehaald
  streakPerWeek: 15,     // per extra week op rij dat je je weekdoel haalt
  streakCap: 60,         // maximale streakbonus per week
  pr: 25,                // persoonlijk record
  group: 30,             // iedereen haalde deze week zijn weekdoel
  defaultGoal: 3,        // als iemand nog geen weekdoel heeft ingesteld
};

export interface Week {
  start: string;        // eerste dag binnen de challenge
  end: string;          // laatste dag binnen de challenge
  days: number;
  status: 'done' | 'current' | 'future';
}

export function challengeWeeks(c: Challenge, now = today()): Week[] {
  const weeks: Week[] = [];
  let mon = mondayOf(c.start_date);
  while (mon <= c.end_date) {
    const start = mon < c.start_date ? c.start_date : mon;
    const sun = addDays(mon, 6);
    const end = sun > c.end_date ? c.end_date : sun;
    const status = end < now ? 'done' : start > now ? 'future' : 'current';
    weeks.push({ start, end, days: daysBetween(start, end) + 1, status });
    mon = addDays(mon, 7);
  }
  return weeks;
}

/** Benodigd aantal trainingen in een (eventueel korte) week. */
export function required(goal: number, days: number): number {
  return Math.max(1, Math.ceil((goal * days) / 7));
}

export interface WeekResult { week: Week; sessions: number; required: number; met: boolean }

export interface Score {
  userId: string;
  sessions: number;
  minutes: number;
  km: number;
  prs: number;
  base: number;
  goalBonus: number;
  streakBonus: number;
  prBonus: number;
  groupBonus: number;
  total: number;
  goal: number;
  goalSet: boolean;
  weeks: WeekResult[];
  streak: number;          // huidige weekstreak
  thisWeek: WeekResult | null;
}

export function computeScores(
  challenge: Challenge,
  memberIds: string[],
  activities: Activity[],
  goals: WeeklyGoal[],
  now = today(),
): Score[] {
  const weeks = challengeWeeks(challenge, now).filter((w) => w.status !== 'future');
  const inChallenge = activities.filter(
    (a) => a.activity_date >= challenge.start_date && a.activity_date <= challenge.end_date,
  );

  const scores: Score[] = memberIds.map((uid) => {
    const mine = inChallenge.filter((a) => a.user_id === uid);
    const g = goals.find((x) => x.user_id === uid && x.challenge_id === challenge.id);
    const goal = g?.sessions_per_week ?? RULES.defaultGoal;

    const weekResults: WeekResult[] = weeks.map((w) => {
      const sessions = mine.filter((a) => a.activity_date >= w.start && a.activity_date <= w.end).length;
      const req = required(goal, w.days);
      return { week: w, sessions, required: req, met: sessions >= req };
    });

    let streak = 0;
    let streakBonus = 0;
    let goalBonus = 0;
    for (const r of weekResults) {
      if (r.met) {
        streak += 1;
        goalBonus += RULES.weekGoal;
        streakBonus += Math.min(RULES.streakCap, (streak - 1) * RULES.streakPerWeek);
      } else if (r.week.status === 'done') {
        streak = 0;
      }
    }

    const minutes = mine.reduce((s, a) => s + a.duration_min, 0);
    const km = mine.reduce((s, a) => s + (Number(a.distance_km) || 0), 0);
    const prs = mine.filter((a) => a.is_pr).length;
    const base = minutes * RULES.perMinute;
    const prBonus = prs * RULES.pr;

    return {
      userId: uid, sessions: mine.length, minutes, km, prs, base, goalBonus, streakBonus, prBonus,
      groupBonus: 0, total: 0, goal, goalSet: Boolean(g), weeks: weekResults, streak,
      thisWeek: weekResults.find((r) => r.week.status === 'current') ?? null,
    };
  });

  // Groepsbonus: elke week waarin iedereen zijn doel haalde
  const groupWeeks = weeks.filter((_, i) => scores.length > 1 && scores.every((s) => s.weeks[i].met)).length;
  for (const s of scores) {
    s.groupBonus = groupWeeks * RULES.group;
    s.total = s.base + s.goalBonus + s.streakBonus + s.prBonus + s.groupBonus;
  }
  return scores.sort((a, b) => b.total - a.total);
}

/** Opeenvolgende dagen met minstens één training (t/m vandaag of gisteren). */
export function dayStreak(activities: Activity[], userId: string, now = today()): number {
  const days = new Set(activities.filter((a) => a.user_id === userId).map((a) => a.activity_date));
  let d = days.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}
