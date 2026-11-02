import { COLORS } from '../types';

export default function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors">
      {COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} className={'swatch' + (c === value ? ' on' : '')}
          style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}
