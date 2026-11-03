export type Sport = 'hardlopen' | 'kracht' | 'overig';

export interface Profile { id: string; display_name: string; color: string }
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
