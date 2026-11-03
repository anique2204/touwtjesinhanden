import type { BodyDay } from './types';
import { addDays, daysBetween } from './dates';

export type Phase = 'menstruatie' | 'folliculair' | 'ovulatie' | 'luteaal';

export const PHASES: Record<Phase, { emoji: string; label: string; tip: string }> = {
  menstruatie: { emoji: '🩸', label: 'Menstruatie', tip: 'Rustig aan mag. Zacht bewegen helpt vaak tegen kramp, maar forceer niets.' },
  folliculair: { emoji: '🌱', label: 'Folliculaire fase', tip: 'Je energie loopt vaak op. Een mooi moment voor iets nieuws of een pittige training.' },
  ovulatie: { emoji: '☀️', label: 'Rond de ovulatie', tip: 'Voor veel mensen een piek in energie en zin.' },
  luteaal: { emoji: '🍂', label: 'Luteale fase', tip: 'Energie kan dalen en trek kan toenemen. Wees mild voor jezelf.' },
};
export const PHASE_ORDER: Phase[] = ['menstruatie', 'folliculair', 'ovulatie', 'luteaal'];

/** Eerste dagen van elke menstruatie (een menstruatiedag waarvan de dag ervoor geen menstruatie was). */
export function periodStarts(days: BodyDay[]): string[] {
  const set = new Set(days.filter((d) => d.period).map((d) => d.day));
  return [...set].filter((d) => !set.has(addDays(d, -1))).sort();
}

function periodLengths(days: BodyDay[]): number[] {
  const set = new Set(days.filter((d) => d.period).map((d) => d.day));
  return periodStarts(days).map((s) => { let n = 0; while (set.has(addDays(s, n))) n += 1; return n; });
}

export interface CycleInfo {
  starts: string[];
  avgCycle: number;
  avgPeriod: number;
  measured: boolean;   // true als het gemiddelde uit je eigen gegevens komt
}

export function cycleInfo(days: BodyDay[], fallbackCycle?: number | null, fallbackPeriod?: number | null): CycleInfo {
  const starts = periodStarts(days);
  const diffs = starts.slice(1).map((s, i) => daysBetween(starts[i], s)).filter((d) => d >= 18 && d <= 60).slice(-6);
  const lens = periodLengths(days).filter((l) => l >= 1 && l <= 14).slice(-6);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    starts,
    avgCycle: diffs.length ? avg(diffs) : fallbackCycle ?? 28,
    avgPeriod: lens.length ? avg(lens) : fallbackPeriod ?? 5,
    measured: diffs.length > 0,
  };
}

/** Cyclusdag en (geschatte) fase op een dag, of null als er nog geen menstruatie vóór die dag is gelogd. */
export function phaseOn(day: string, info: CycleInfo): { cycleDay: number; phase: Phase; cycleLength: number } | null {
  let idx = -1;
  info.starts.forEach((s, i) => { if (s <= day) idx = i; });
  if (idx < 0) return null;
  const start = info.starts[idx];
  const next = info.starts[idx + 1];
  const cycleLength = next ? daysBetween(start, next) : info.avgCycle;
  const cycleDay = daysBetween(start, day) + 1;
  if (cycleDay > 60) return null; // te lang geleden, geen zinnige schatting
  const ov = cycleLength - 14;
  const phase: Phase =
    cycleDay <= info.avgPeriod ? 'menstruatie'
    : cycleDay < ov - 1 ? 'folliculair'
    : cycleDay <= ov + 1 ? 'ovulatie'
    : 'luteaal';
  return { cycleDay, phase, cycleLength };
}

export function nextPeriod(info: CycleInfo): string | null {
  const last = info.starts[info.starts.length - 1];
  return last ? addDays(last, info.avgCycle) : null;
}
