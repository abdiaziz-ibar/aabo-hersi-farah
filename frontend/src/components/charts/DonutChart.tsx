import React from 'react';
import { translate } from '../../i18n';
import { useProgress } from './useProgress';

export interface DonutDatum {
  value: number;
  color: string;
}

interface Props {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  trackColor: string;
  centerLabel: string;
  centerSub?: string;
  duration?: number;
}

export function DonutChart({
  data, size = 140, thickness = 18, trackColor, centerLabel, centerSub, duration = 600,
}: Props) {
  const p = useProgress(JSON.stringify(data), duration);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let start = 0; // fraction of the circle where the segment begins
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const visible = frac > 0 ? Math.min(1, Math.max(0, (p - start) / frac)) : 0;
    const dash = frac * C * visible;
    const el = (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={d.color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={-start * C}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    start += frac;
    return el;
  });

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={translate('Bixidda halka ay aaday')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} opacity={0.5} />
        {segs}
      </svg>
      <div className="donut-center">
        <strong>{centerLabel}</strong>
        {centerSub && <span>{centerSub}</span>}
      </div>
    </div>
  );
}
