import { useState } from 'react';
import { today } from '../dates';
import { RULES } from '../points';

const KEY = 'lockedin.seen.points-v2';

/** Eenmalige melding (alleen op RULES.launchDate) over het nieuwe puntensysteem. */
export default function Announcement({ onMore }: { onMore: () => void }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  if (hidden || today() !== RULES.launchDate) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };

  return (
    <section className="card announce">
      <button className="announce-x" onClick={close} aria-label="Sluiten">×</button>
      <b>📣 Nieuw puntensysteem</b>
      <p className="small">
        Punten gaan nu over <b>hoe trouw je bent aan je eigen doelen</b>, niet over hoeveel doelen je hebt.
        Per week max. {RULES.week} punten naar verhouding van wat je haalt, plus ⭐ +{RULES.perfectWeek} voor een perfecte week.
        Met minder dan {RULES.minGoals} doelen verdien je naar verhouding minder.
      </p>
      <p className="small muted">Alles is opnieuw berekend vanaf 1 november, dus de stand kan veranderd zijn.</p>
      <div className="announce-actions">
        <button className="link small" onClick={() => { close(); onMore(); }}>Bekijk de ranglijst</button>
        <button className="link small" onClick={close}>Begrepen 👍</button>
      </div>
    </section>
  );
}
