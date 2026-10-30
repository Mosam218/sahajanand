// The catalogue spans −86°C (ultra-low freezers) to 90°C (heated showcases).
// Every product is drawn on that one axis so ranges are comparable at a glance.
import { fmtTemp } from '../../utils/format.js';
import './TempScale.css';

export const AXIS_MIN = -90;
export const AXIS_MAX = 90;
const pct = (v) => ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;
const CLASS_KEY = { 'Ultra-low': 'ultra', Freezer: 'freezer', Chiller: 'chiller', 'Dual / convertible': 'dual', Heated: 'heated' };
const TICKS = [-86, -40, -18, 0, 25, 90];

export default function TempScale({ temp, tempClass, detailed = false }) {
  if (!temp) return null;
  const [min, max] = temp;
  const left = pct(min);
  const width = Math.max(pct(max) - left, 1.6);
  const label = min === max ? fmtTemp(min) : `${fmtTemp(min)} to ${fmtTemp(max)}`;
  return (
    <div className={`tscale ${detailed ? 'tscale--detailed' : ''}`} data-class={CLASS_KEY[tempClass]}>
      <div className="tscale__track" role="img" aria-label={`Operating range ${label} on a scale from −90°C to 90°C`}>
        <span className="tscale__zero" style={{ left: `${pct(0)}%` }} />
        <span className="tscale__range" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      {detailed && (
        <div className="tscale__ticks num" aria-hidden="true">
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${pct(t)}%` }}>{t > 0 ? `+${t}` : t === 0 ? '0' : `−${Math.abs(t)}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}
