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

export const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#4b5563'];
