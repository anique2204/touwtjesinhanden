export type Sport = 'hardlopen' | 'kracht' | 'overig';

export interface Profile {
  id: string; display_name: string; color: string;
  avatar_path?: string | null;
  avatar_url?: string | null;   // tijdelijke link, wordt door de app ingevuld
}
export interface Group { id: string; name: string; invite_code: string; max_members: number; created_by: string }
export interface Member { group_id: string; user_id: string; role: 'admin' | 'member'; joined_at: string }
export interface Challenge { id: string; group_id: string; name: string; start_date: string; end_date: string }
export interface WeeklyGoal { challenge_id: string; user_id: string; sessions_per_week: number }
export interface Activity {
  id: string; group_id: string; user_id: string; sport: Sport; label: string | null;
  activity_date: string; duration_min: number; distance_km: number | null; notes: string | null;
  photo_path: string | null; is_pr: boolean; created_at: string;
}
export interface Kudo { activity_id: string; user_id: string }
export interface Comment { id: string; activity_id: string; user_id: string; body: string; created_at: string }

export const SPORTS: Record<Sport, { label: string; emoji: string }> = {
  hardlopen: { label: 'Hardlopen', emoji: '🏃' },
  kracht: { label: 'Kracht', emoji: '🏋️' },
  overig: { label: 'Overig', emoji: '✨' },
};

export const COLORS = ['#703d57', '#957186', '#402a2c', '#c0768f', '#5b6f8a', '#4f7a6a', '#b0794a', '#8a5a9e'];

export type Pose = 'front' | 'back' | 'left' | 'right';
export const POSES: { id: Pose; label: string }[] = [
  { id: 'front', label: 'Voor' },
  { id: 'back', label: 'Achter' },
  { id: 'left', label: 'Links' },
  { id: 'right', label: 'Rechts' },
];

export interface Measurement {
  id: string; user_id: string; measured_on: string;
  weight_kg: number | null; waist_cm: number | null; belly_cm: number | null;
  hips_cm?: number | null; chest_cm?: number | null; arm_cm?: number | null; thigh_cm?: number | null; fat_pct?: number | null;
  photo_front: string | null; photo_back: string | null; photo_left: string | null; photo_right: string | null;
  note: string | null; created_at: string;
}

export const photoOf = (m: Measurement, pose: Pose): string | null => m[`photo_${pose}`];

export type MeasureKey = 'weight_kg' | 'waist_cm' | 'belly_cm' | 'hips_cm' | 'chest_cm' | 'arm_cm' | 'thigh_cm' | 'fat_pct';
export const MEASURE_FIELDS: { key: MeasureKey; label: string; unit: string; placeholder: string; tip: string }[] = [
  { key: 'weight_kg', label: 'Gewicht', unit: 'kg', placeholder: '72,5', tip: '’s Ochtends nuchter, na het plassen, zonder kleding of altijd dezelfde.' },
  { key: 'waist_cm', label: 'Taille', unit: 'cm', placeholder: '80', tip: 'Rond het smalste deel van je middel, meestal net boven je navel.' },
  { key: 'belly_cm', label: 'Buik', unit: 'cm', placeholder: '88', tip: 'Precies ter hoogte van je navel.' },
  { key: 'hips_cm', label: 'Heupen', unit: 'cm', placeholder: '98', tip: 'Rond het breedste punt van je billen, lint horizontaal.' },
  { key: 'chest_cm', label: 'Borst', unit: 'cm', placeholder: '92', tip: 'Rond het volste punt, ter hoogte van je tepels.' },
  { key: 'arm_cm', label: 'Bovenarm', unit: 'cm', placeholder: '28', tip: 'Dikste punt van je bovenarm, arm ontspannen langs je lichaam. Altijd dezelfde arm.' },
  { key: 'thigh_cm', label: 'Bovenbeen', unit: 'cm', placeholder: '56', tip: 'Dikste punt, halverwege heup en knie. Altijd hetzelfde been.' },
  { key: 'fat_pct', label: 'Vetpercentage', unit: '%', placeholder: '28', tip: 'Van een slimme weegschaal of een meting bij sportschool/diëtist. Thuisweegschalen zijn onnauwkeurig: kijk vooral naar de trend.' },
];
export const DEFAULT_MEASURES: MeasureKey[] = ['weight_kg', 'waist_cm', 'belly_cm'];

export type Difficulty = 'makkelijk' | 'normaal' | 'moeilijk';
export const DIFFICULTIES: { id: Difficulty; label: string; icon: string; weight: number }[] = [
  { id: 'makkelijk', label: 'Makkelijk', icon: '🌱', weight: 0.5 },
  { id: 'normaal', label: 'Gemiddeld', icon: '💪', weight: 1 },
  { id: 'moeilijk', label: 'Moeilijk', icon: '🔥', weight: 1.5 },
];
export const difficultyOf = (d?: string | null) => DIFFICULTIES.find((x) => x.id === d) ?? DIFFICULTIES[1];

export interface Habit {
  difficulty?: Difficulty;
  per_day?: number;            // >1 = meerdere keren per dag (teller)
  options?: string[];          // keuzedoel: één van deze opties is genoeg
  reminder_times?: string[];   // 'HH:MM', alleen voor de eigenaar zichtbaar
  id: string; user_id: string; title: string | null; emoji: string; per_week: number;
  is_private: boolean; start_date: string; archived_on: string | null; created_at: string;
}
export interface HabitCheck { habit_id: string; group_id: string; user_id: string; check_date: string; count?: number; option?: string | null }

/** Hoe vaak per dag een doel moet (minimaal 1). */
export const perDay = (h?: Pick<Habit, 'per_day'> | null) => Math.max(1, h?.per_day ?? 1);
/** Deel van de dag gedaan (0–1) voor één vinkje-rij. */
export const checkPart = (c: HabitCheck, h?: Pick<Habit, 'per_day'> | null) => Math.min(c.count ?? 1, perDay(h)) / perDay(h);
/** Is het doel op die dag helemaal gedaan? */
export const checkFull = (c: HabitCheck, h?: Pick<Habit, 'per_day'> | null) => (c.count ?? 1) >= perDay(h);
export type CheerKind = 'highfive' | 'heart' | 'thinking';
export interface Cheer { group_id: string; from_user: string; to_user: string; day: string; kind: CheerKind }
export const CHEER_KINDS: { id: CheerKind; emoji: string; label: string }[] = [
  { id: 'highfive', emoji: '🙌', label: 'High five' },
  { id: 'heart', emoji: '❤️', label: 'Hartje' },
  { id: 'thinking', emoji: '🫶', label: 'Denk aan je' },
];

export interface PauseDay { user_id: string; group_id: string; day: string }

export interface Mood { user_id: string; group_id: string; day: string; score: number; tags: string[]; note: string | null; shared: boolean }
export interface SharedMood { user_id: string; day: string; score: number }
// img: optioneel eigen icoontje, bijv. '/moods/1.png' (zet het bestand in public/moods/)
export const MOODS: { score: number; emoji: string; label: string; img?: string }[] = [
  { score: 1, emoji: '😣', label: 'Zwaar' },
  { score: 2, emoji: '😕', label: 'Matig' },
  { score: 3, emoji: '😐', label: 'Oké' },
  { score: 4, emoji: '🙂', label: 'Goed' },
  { score: 5, emoji: '😄', label: 'Top' },
];
export const moodEmoji = (score: number) => MOODS.find((m) => m.score === score)?.emoji ?? '❔';
export const MOOD_TAGS = ['energiek', 'moe', 'rustig', 'gestrest', 'blij', 'prikkelbaar', 'verdrietig', 'trots', 'ziek', 'slecht geslapen'];

export interface PrivateSettings {
  user_id: string; track_period: boolean; track_sex: boolean; cycle_length: number | null; period_length: number | null;
  measure_fields?: string[]; height_cm?: number | null;
}
export type Flow = 'spotting' | 'licht' | 'normaal' | 'hevig';
export interface BodyDay {
  user_id: string; day: string; period: boolean; flow: Flow | null; symptoms: string[];
  sex: boolean; sex_protected: boolean | null; note: string | null;
}
export const SYMPTOMS = ['kramp', 'hoofdpijn', 'moe', 'opgeblazen', 'gevoelige borsten', 'rugpijn', 'acne', 'trek', 'misselijk', 'slecht geslapen'];

export const HABIT_IDEAS: { emoji: string; title: string; per_week: number }[] = [
  { emoji: '💧', title: '2 liter water', per_week: 7 },
  { emoji: '👣', title: '10.000 stappen', per_week: 7 },
  { emoji: '😴', title: 'Voor 23:00 naar bed', per_week: 7 },
  { emoji: '🍷', title: 'Geen alcohol', per_week: 7 },
  { emoji: '🍬', title: 'Geen snoep', per_week: 7 },
  { emoji: '🧘', title: '10 min stretchen', per_week: 7 },
  { emoji: '🥗', title: 'Groente bij elke maaltijd', per_week: 7 },
  { emoji: '📵', title: 'Geen telefoon in bed', per_week: 7 },
  { emoji: '📖', title: '15 min lezen', per_week: 5 },
  { emoji: '🧠', title: 'Mediteren', per_week: 5 },
  { emoji: '🚶', title: 'Wandeling buiten', per_week: 4 },
  { emoji: '🍳', title: 'Zelf koken', per_week: 4 },
];

export const EMOJIS = ['🎯', '💧', '👣', '😴', '🍷', '🍬', '🧘', '🥗', '📵', '📖', '🧠', '🚶', '🍳', '💪', '🏃', '🚴', '🏊', '🍎', '☕', '🚭', '🙏', '✍️', '🌞', '❤️'];
