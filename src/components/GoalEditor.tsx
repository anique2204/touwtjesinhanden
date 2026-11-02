import { useState } from 'react';
import { errMsg, supabase } from '../supabase';
import { useStore } from '../store';
import type { Challenge } from '../types';
import { RULES } from '../points';

export default function GoalEditor({ challenge }: { challenge: Challenge }) {
  const { me, data, reload } = useStore();
  const existing = data.goals.find((g) => g.challenge_id === challenge.id && g.user_id === me.id);
  const [n, setN] = useState(existing?.sessions_per_week ?? RULES.defaultGoal);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from('weekly_goals').upsert({
      challenge_id: challenge.id, user_id: me.id, sessions_per_week: n,
    });
    if (error) alert(errMsg(error));
    await reload();
    setBusy(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="goal-editor">
      <button type="button" className="round" onClick={() => setN((x) => Math.max(1, x - 1))}>−</button>
      <div className="goal-n"><b>{n}×</b><span>per week</span></div>
      <button type="button" className="round" onClick={() => setN((x) => Math.min(14, x + 1))}>+</button>
      <button type="button" className="btn small" disabled={busy || existing?.sessions_per_week === n} onClick={save}>
        {saved ? 'Opgeslagen ✓' : 'Opslaan'}
      </button>
    </div>
  );
}
