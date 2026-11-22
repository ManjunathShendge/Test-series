import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '@/ui/primitives';
import { colors, palette, space } from '@/ui/tokens';

export interface ChartPoint {
  /** Short axis label. */
  label: string;
  value: number;
  /** Full spoken description of this point. */
  description: string;
}

export interface LineChartProps {
  points: ChartPoint[];
  max: number;
  /** Dashed reference line, e.g. a cutoff. */
  threshold?: { value: number; label: string };
  selectedIndex: number;
  onSelect: (index: number) => void;
  height?: number;
}

const PAD_TOP = 16;
const PAD_BOTTOM = 8;
const DOT = 6;

/** Catmull-Rom through the points, as cubic Beziers: a smooth line that still hits every value. */
function smoothPath(xy: { x: number; y: number }[]): string {
  if (xy.length === 0) return '';
  const first = xy[0]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i]!;
    const p1 = xy[i]!;
    const p2 = xy[i + 1]!;
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Interactive line chart (reference: heart-rate and audience-flow charts). Each point owns
 * a full-height tap column that is a real button, so selection works by touch and by screen
 * reader; the selected value is also printed as text below, never shown by colour alone.
 */
export function LineChart({ points, max, threshold, selectedIndex, onSelect, height = 160 }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  // Points sit at the centre of equal columns, so dots, tap targets and axis labels align.
  const xAt = (i: number) => ((i + 0.5) * width) / Math.max(1, points.length);
  const yAt = (v: number) => PAD_TOP + plotH * (1 - Math.max(0, Math.min(1, v / max)));
  const xy = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));
  const line = smoothPath(xy);
  const last = xy[xy.length - 1];
  const firstPt = xy[0];
  const area = line && last && firstPt ? `${line} L ${last.x} ${height} L ${firstPt.x} ${height} Z` : '';
  const sel = xy[selectedIndex];

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.sky300} stopOpacity={0.35} />
                <Stop offset="1" stopColor={palette.sky300} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={width} y1={PAD_TOP + plotH * f} y2={PAD_TOP + plotH * f} stroke={colors.border} strokeWidth={1} />
            ))}
            {threshold ? (
              <Line x1={0} x2={width} y1={yAt(threshold.value)} y2={yAt(threshold.value)} stroke={palette.teal500} strokeWidth={1.5} strokeDasharray="6 5" />
            ) : null}
            {area ? <Path d={area} fill="url(#area)" /> : null}
            {sel ? <Line x1={sel.x} x2={sel.x} y1={PAD_TOP - 8} y2={height} stroke={palette.navy700} strokeWidth={1} strokeDasharray="3 4" /> : null}
            <Path d={line} stroke={palette.navy700} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            {xy.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === selectedIndex ? DOT : 3.5}
                fill={i === selectedIndex ? palette.sky300 : palette.white}
                stroke={palette.navy700}
                strokeWidth={i === selectedIndex ? 3 : 2}
              />
            ))}
          </Svg>
        ) : null}
        {threshold && width > 0 ? (
          <Text variant="caption" style={[styles.thresholdLabel, { top: yAt(threshold.value) - 18 }]}>
            {threshold.label}
          </Text>
        ) : null}
        <View style={styles.hits}>
          {points.map((p, i) => (
            <Pressable
              key={i}
              onPress={() => onSelect(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === selectedIndex }}
              accessibilityLabel={p.description}
              style={styles.hit}
            />
          ))}
        </View>
      </View>
      <View style={styles.axis}>
        {points.map((p, i) => (
          <Text key={i} variant="caption" tone={i === selectedIndex ? 'default' : 'secondary'} style={styles.axisLabel} numberOfLines={1}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hits: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  hit: { flex: 1, height: '100%' },
  thresholdLabel: { position: 'absolute', right: 0, color: colors.textSecondary, backgroundColor: colors.surface, paddingHorizontal: space.xs },
  axis: { flexDirection: 'row', marginTop: space.sm },
  axisLabel: { flex: 1, textAlign: 'center' },
});
