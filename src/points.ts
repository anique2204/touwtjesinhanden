import type { Activity, Challenge, Habit, HabitCheck, WeeklyGoal } from './types';
import { addDays, daysBetween, mondayOf, today } from './dates';

// ---- Puntenregels (hier aanpassen als de groep andere regels wil) ----
export const RULES = {
  check: 5,          // elk afgevinkt doel
  training: 10,      // elke gelogde training
  pr: 10,            // persoonlijk record
  goalWeek: 15,      // per doel dat je in een week haalt
  perfectWeek: 25,   // alle doelen van de week gehaald
  group: 30,         // iedereen had een perfecte week
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

/** Benodigd aantal keer in een (eventueel korte) periode. */
export function required(perWeek: number, days: number): number {
  return Math.max(1, Math.ceil((perWeek * days) / 7));
}

/** Is een doel actief op deze dag? (gestart en nog niet gestopt) */
export const habitActiveOn = (h: Habit, d: string) => h.start_date <= d && (!h.archived_on || d < h.archived_on);

/** Aantal dagen in [start, end] waarop het doel actief is. */
function activeDays(h: Habit, start: string, end: string): { from: string; to: string; days: number } | null {
  const from = h.start_date > start ? h.start_date : start;
  const stop = h.archived_on ? addDays(h.archived_on, -1) : end;
  const to = stop < end ? stop : end;
  if (to < from) return null;
  return { from, to, days: daysBetween(from, to) + 1 };
}

export interface GoalWeek { kind: 'habit' | 'training'; id: string; label: string; emoji: string; done: number; required: number; met: boolean }
export interface WeekResult { week: Week; goals: GoalWeek[]; perfect: boolean }

export interface Score {
  userId: string;
  checks: number;
  sessions: number;
  minutes: number;
  km: number;
  prs: number;
  checkPts: number;
  trainingPts: number;
  prPts: number;
  goalBonus: number;
  perfectBonus: number;
  groupBonus: number;
  total: number;
  weeks: WeekResult[];
  thisWeek: WeekResult | null;
  perfectWeeks: number;
  goalsMet: number;
}

export interface ScoreInput {
  challenge: Challenge;
  memberIds: string[];
  activities: Activity[];
  goals: WeeklyGoal[];
  habits: Habit[];
  checks: HabitCheck[];
  now?: string;
}

export function computeScores({ challenge: c, memberIds, activities, goals, habits, checks, now = today() }: ScoreInput): Score[] {
  const weeks = challengeWeeks(c, now).filter((w) => w.status !== 'future');
  const inRange = (d: string) => d >= c.start_date && d <= c.end_date && d <= now;
  const acts = activities.filter((a) => inRange(a.activity_date));
  const chks = checks.filter((x) => inRange(x.check_date));

  const scores: Score[] = memberIds.map((uid) => {
    const mine = acts.filter((a) => a.user_id === uid);
    const myChecks = chks.filter((x) => x.user_id === uid);
    const myHabits = habits.filter((h) => h.user_id === uid);
    const tg = goals.find((g) => g.user_id === uid && g.challenge_id === c.id);

    const weekResults: WeekResult[] = weeks.map((w) => {
      const gs: GoalWeek[] = [];
      if (tg) {
        const done = mine.filter((a) => a.activity_date >= w.start && a.activity_date <= w.end).length;
        const req = required(tg.sessions_per_week, w.days);
        gs.push({ kind: 'training', id: 'training', label: `Trainen ${tg.sessions_per_week}× per week`, emoji: '💪', done, required: req, met: done >= req });
      }
      for (const h of myHabits) {
        const r = activeDays(h, w.start, w.end);
        if (!r) continue;
        const done = myChecks.filter((x) => x.habit_id === h.id && x.check_date >= r.from && x.check_date <= r.to).length;
        const req = required(h.per_week, r.days);
        gs.push({ kind: 'habit', id: h.id, label: h.title ?? 'Privé doel', emoji: h.emoji, done, required: req, met: done >= req });
      }
      return { week: w, goals: gs, perfect: gs.length > 0 && gs.every((g) => g.met) };
    });

    const goalsMet = weekResults.reduce((s, r) => s + r.goals.filter((g) => g.met).length, 0);
    const perfectWeeks = weekResults.filter((r) => r.perfect).length;
    const minutes = mine.reduce((s, a) => s + a.duration_min, 0);
    const km = mine.reduce((s, a) => s + (Number(a.distance_km) || 0), 0);
    const prs = mine.filter((a) => a.is_pr).length;

    return {
      userId: uid, checks: myChecks.length, sessions: mine.length, minutes, km, prs,
      checkPts: myChecks.length * RULES.check,
      trainingPts: mine.length * RULES.training,
      prPts: prs * RULES.pr,
      goalBonus: goalsMet * RULES.goalWeek,
      perfectBonus: perfectWeeks * RULES.perfectWeek,
      groupBonus: 0, total: 0,
      weeks: weekResults, perfectWeeks, goalsMet,
      thisWeek: weekResults.find((r) => r.week.status === 'current') ?? null,
    };
  });

  // Groepsbonus: elke week waarin iedereen (met doelen) een perfecte week had
  const groupWeeks = weeks.filter((_, i) => {
    const withGoals = scores.filter((s) => s.weeks[i].goals.length > 0);
    return withGoals.length > 1 && withGoals.length === scores.length && withGoals.every((s) => s.weeks[i].perfect);
  }).length;
  for (const s of scores) {
    s.groupBonus = groupWeeks * RULES.group;
    s.total = s.checkPts + s.trainingPts + s.prPts + s.goalBonus + s.perfectBonus + s.groupBonus;
  }
  return scores.sort((a, b) => b.total - a.total);
}

// ---------- Streaks ----------

/** Streak van één doel: dagen op rij (dagelijks) of weken op rij gehaald (X per week). */
export function habitStreak(h: Habit, checks: HabitCheck[], now = today()): { n: number; unit: 'dag' | 'week' } {
  const days = new Set(checks.filter((x) => x.habit_id === h.id).map((x) => x.check_date));
  if (h.per_week >= 7) {
    let d = days.has(now) ? now : addDays(now, -1);
    let n = 0;
    while (days.has(d) && d >= h.start_date) { n += 1; d = addDays(d, -1); }
    return { n, unit: 'dag' };
  }
  const countIn = (from: string, to: string) => [...days].filter((d) => d >= from && d <= to).length;
  let mon = mondayOf(now);
  let n = 0;
  // huidige week telt mee zodra hij gehaald is; anders beginnen bij vorige week
  const cur = activeDays(h, mon, addDays(mon, 6));
  if (cur && countIn(cur.from, cur.to) >= required(h.per_week, cur.days)) n += 1;
  mon = addDays(mon, -7);
  for (;;) {
    const r = activeDays(h, mon, addDays(mon, 6));
    if (!r || countIn(r.from, r.to) < required(h.per_week, r.days)) break;
    n += 1;
    mon = addDays(mon, -7);
  }
  return { n, unit: 'week' };
}

/** Dagen op rij dat iemand iets gedaan heeft (doel afgevinkt of getraind). */
export function activeStreak(userId: string, checks: HabitCheck[], activities: Activity[], now = today()): number {
  const days = new Set([
    ...checks.filter((x) => x.user_id === userId).map((x) => x.check_date),
    ...activities.filter((a) => a.user_id === userId).map((a) => a.activity_date),
  ]);
  let d = days.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

// ---------- Per dag (vandaag + kalender) ----------

export interface DayStatus {
  done: number;          // afgevinkte doelen die dag
  total: number;         // doelen die die dag "open" stonden
  trainings: number;
  level: 'none' | 'some' | 'all';
}

/**
 * Status van iemand op een dag. Dagelijkse doelen moeten die dag; een doel van X per week
 * telt als "klaar" als het die dag is afgevinkt óf de week al gehaald was.
 */
export function dayStatus(userId: string, day: string, habits: Habit[], checks: HabitCheck[], activities: Activity[]): DayStatus {
  const mine = habits.filter((h) => h.user_id === userId && habitActiveOn(h, day));
  const myChecks = checks.filter((x) => x.user_id === userId);
  const mon = mondayOf(day);
  let done = 0, total = 0;
  for (const h of mine) {
    const checkedToday = myChecks.some((x) => x.habit_id === h.id && x.check_date === day);
    if (h.per_week >= 7) {
      total += 1;
      if (checkedToday) done += 1;
    } else {
      const r = activeDays(h, mon, addDays(mon, 6));
      const before = myChecks.filter((x) => x.habit_id === h.id && x.check_date >= mon && x.check_date < day).length;
      const weekMet = r ? before >= required(h.per_week, r.days) : false;
      if (checkedToday) { total += 1; done += 1; } else if (!weekMet) { total += 1; }
    }
  }
  const trainings = activities.filter((a) => a.user_id === userId && a.activity_date === day).length;
  const level = total > 0 && done === total ? 'all' : done > 0 || trainings > 0 ? 'some' : 'none';
  return { done, total, trainings, level };
}
