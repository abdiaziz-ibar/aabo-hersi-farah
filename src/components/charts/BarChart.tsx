import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useProgress } from './useProgress';

export interface BarDatum {
  label: string;
  a: number; // first series (e.g. income)
  b: number; // second series (e.g. expense)
}

interface Props {
  data: BarDatum[];
  colorA: string;
  colorB: string;
  gridColor: string;
  labelColor: string;
  height?: number;
  duration?: number;
}

const LABEL_H = 22;

export function BarChart({
  data, colorA, colorB, gridColor, labelColor, height = 170, duration = 600,
}: Props) {
  const [w, setW] = useState(0);
  const p = useProgress(JSON.stringify(data), duration);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const plotH = height - LABEL_H;
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const group = data.length ? w / data.length : 0;
  const barW = Math.min(14, group * 0.28);
  const gap = 3;
  const grid = [0, plotH / 2, plotH - 1]; // top, middle, baseline

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <>
          <Svg width={w} height={plotH}>
            {grid.map((y, i) => (
              <Line key={i} x1={0} x2={w} y1={y} y2={y} stroke={gridColor} strokeWidth={1} opacity={0.6} />
            ))}
            {data.map((d, i) => {
              const cx = group * i + group / 2;
              const ha = (d.a / max) * (plotH - 4) * p;
              const hb = (d.b / max) * (plotH - 4) * p;
              return (
                <React.Fragment key={i}>
                  <Rect x={cx - barW - gap / 2} y={plotH - 1 - ha} width={barW} height={ha} rx={4} fill={colorA} />
                  <Rect x={cx + gap / 2} y={plotH - 1 - hb} width={barW} height={hb} rx={4} fill={colorB} />
                </React.Fragment>
              );
            })}
          </Svg>
          <View style={{ flexDirection: 'row', height: LABEL_H, alignItems: 'flex-end' }}>
            {data.map((d, i) => (
              <Text key={i} style={{ width: group, textAlign: 'center', fontSize: 11, color: labelColor }}>
                {d.label}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
