import React, { useEffect, useRef, useState } from 'react';
import { translate } from '../../i18n';
import { useProgress } from './useProgress';

export interface BarDatum {
  label: string;
  a: number; // first series (income)
  b: number; // second series (expense)
}

interface Props {
  data: BarDatum[];
  colorA: string;
  colorB: string;
  gridColor: string;
  labelColor: string;
  duration?: number;
}

const H = 200;
const LABEL_H = 24;

export function BarChart({ data, colorA, colorB, gridColor, labelColor, duration = 600 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(340);
  const p = useProgress(JSON.stringify(data), duration);

  // Fit the chart to its container so it looks right on phones and wide screens.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setW(Math.max(200, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotH = H - LABEL_H;
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const group = W / Math.max(1, data.length);
  const barW = Math.min(26, group * 0.28);
  const gap = 4;
  const grid = [1, plotH / 2, plotH - 1]; // 3 faint lines: top, middle, baseline

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      <svg width={W} height={H} role="img" aria-label={translate('Soo gal iyo bixid')} style={{ display: 'block' }}>
        {grid.map((y, i) => (
          <line key={i} x1={0} x2={W} y1={y} y2={y} stroke={gridColor} strokeWidth={1} opacity={0.7} />
        ))}
        {data.map((d, i) => {
          const cx = group * i + group / 2;
          const ha = (d.a / max) * (plotH - 6) * p;
          const hb = (d.b / max) * (plotH - 6) * p;
          return (
            <g key={i}>
              <rect x={cx - barW - gap / 2} y={plotH - 1 - ha} width={barW} height={ha} rx={5} fill={colorA} />
              <rect x={cx + gap / 2} y={plotH - 1 - hb} width={barW} height={hb} rx={5} fill={colorB} />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={12} fill={labelColor}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
