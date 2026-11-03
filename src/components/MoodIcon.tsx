import { MOODS } from '../types';

/**
 * Mood-icoon: een eigen afbeelding als die is ingesteld (MOODS[].img), anders de emoji.
 * Eigen icoontjes toevoegen: zet ze in public/moods/ en vul `img` in bij MOODS in types.ts.
 */
export default function MoodIcon({ score, size = '1em' }: { score: number; size?: string | number }) {
  const m = MOODS.find((x) => x.score === score);
  if (!m) return <>❔</>;
  if (m.img) return <img className="mood-img" src={m.img} alt={m.label} style={{ width: size, height: size }} />;
  return <span role="img" aria-label={m.label}>{m.emoji}</span>;
}
