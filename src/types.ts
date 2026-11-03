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
  photo_front: string | null; photo_back: string | null; photo_left: string | null; photo_right: string | null;
  note: string | null; created_at: string;
}

export const photoOf = (m: Measurement, pose: Pose): string | null => m[`photo_${pose}`];

export interface Habit {
  id: string; user_id: string; title: string | null; emoji: string; per_week: number;
  is_private: boolean; start_date: string; archived_on: string | null; created_at: string;
}
export interface HabitCheck { habit_id: string; group_id: string; user_id: string; check_date: string }
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

export interface PrivateSettings { user_id: string; track_period: boolean; track_sex: boolean; cycle_length: number | null; period_length: number | null }
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
