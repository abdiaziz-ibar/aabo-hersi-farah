import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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
  textColor: string;
  subColor: string;
  duration?: number;
}

export function DonutChart({
  data, size = 140, thickness = 18, trackColor, centerLabel, centerSub,
  textColor, subColor, duration = 600,
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
      <Circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={d.color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={-start * C}
        fill="none"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    );
    start += frac;
    return el;
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" opacity={0.5} />
        {segs}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={{ fontSize: 16, fontWeight: '700', color: textColor }}>{centerLabel}</Text>
        {centerSub ? <Text style={{ fontSize: 11, color: subColor }}>{centerSub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
