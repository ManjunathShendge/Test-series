import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Exam } from '@/lib/catalogue/types';
import { Text } from '@/ui/primitives';
import { palette, space } from '@/ui/tokens';

type Shape = 'scallop' | 'square' | 'circle';

const SLOTS: { shape: Shape; fill: string; fg: string; fgSecondary: string; rotate: string }[] = [
  { shape: 'scallop', fill: palette.sky300, fg: palette.navy900, fgSecondary: palette.navy900, rotate: '-14deg' },
  { shape: 'square', fill: palette.ice100, fg: palette.navy900, fgSecondary: palette.navy700, rotate: '9deg' },
  { shape: 'circle', fill: palette.navy700, fg: palette.white, fgSecondary: palette.ice100, rotate: '-10deg' },
];

/** Scalloped badge: a circle with `n` rounded bumps. */
function scallopPath(size: number, n = 12): string {
  const c = size / 2;
  const rIn = size * 0.42;
  const rOut = size * 0.53;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = c + rIn * Math.cos(a);
    const y = c + rIn * Math.sin(a);
    if (i === 0) {
      d += `M ${x} ${y}`;
      continue;
    }
    const m = ((i - 0.5) / n) * Math.PI * 2;
    d += ` Q ${c + rOut * Math.cos(m)} ${c + rOut * Math.sin(m)} ${x} ${y}`;
  }
  return `${d} Z`;
}

function ShapeFill({ shape, size, fill }: { shape: Shape; size: number; fill: string }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {shape === 'scallop' ? <Path d={scallopPath(size)} fill={fill} /> : null}
      {shape === 'square' ? <Rect x={size * 0.04} y={size * 0.04} width={size * 0.92} height={size * 0.92} rx={size * 0.16} fill={fill} /> : null}
      {shape === 'circle' ? <Circle cx={size / 2} cy={size / 2} r={size * 0.47} fill={fill} /> : null}
    </Svg>
  );
}

/**
 * Editorial exam picker (owner design reference 2, "Activities just for your taste"):
 * up to three exams as overlapping, slightly rotated shapes in the brand palette. Each
 * shape is one button; text stays upright enough to read and passes contrast on its fill.
 */
export function ExamShapes({ exams, onOpen }: { exams: Exam[]; onOpen: (id: string) => void }) {
  const [width, setWidth] = useState(0);
  const size = Math.min(176, Math.max(128, width * 0.5));
  const placed = exams.slice(0, 3);
  // Positions as fractions of the available width, overlapping like the reference.
  const spots = [
    { left: 0, top: 0 },
    { left: Math.max(0, width - size), top: size * 0.32 },
    { left: width * 0.08, top: size * 0.92 },
  ];

  return (
    <View style={[styles.root, { height: width ? size * 1.95 : 0 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0
        ? placed.map((exam, i) => {
            const slot = SLOTS[i]!;
            const spot = spots[i]!;
            return (
              <Pressable
                key={exam.id}
                onPress={() => onOpen(exam.id)}
                accessibilityRole="button"
                accessibilityLabel={`${exam.name}, ${exam.testCount} tests`}
                style={({ pressed }) => [
                  styles.shape,
                  { width: size, height: size, left: spot.left, top: spot.top, transform: [{ rotate: slot.rotate }, { scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <ShapeFill shape={slot.shape} size={size} fill={slot.fill} />
                <Text variant="title" align="center" style={{ color: slot.fg }} numberOfLines={2}>
                  {exam.shortName}
                </Text>
                <Text variant="bodySmall" align="center" style={{ color: slot.fgSecondary }}>
                  {exam.testCount} tests
                </Text>
              </Pressable>
            );
          })
        : null}
      {width > 0 ? (
        <View style={[styles.note, { top: size * 1.38, left: width * 0.08 + size + space.sm }]} pointerEvents="none">
          <Text variant="bodySmallStrong">Have you picked your next exam?</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  shape: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  note: { position: 'absolute', right: 0 },
});
