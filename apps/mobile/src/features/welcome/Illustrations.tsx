import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { palette } from '@/ui/tokens';

/*
 * Launch-screen illustrations in the spirit of the 3D onboarding reference: layered
 * platforms with floating exam objects, drawn as pseudo-3D SVG in the brand palette only.
 * Decorative: hidden from screen readers (the slide heading carries the meaning).
 */

const W = 280;
const H = 260;
const P = palette;

type Shade = [string, string, string];

/** Gradient across a cylinder's side: dark edges, light middle. */
function SideGradient({ id, shade }: { id: string; shade: Shade }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor={shade[0]} />
      <Stop offset="0.45" stopColor={shade[1]} />
      <Stop offset="1" stopColor={shade[2]} />
    </LinearGradient>
  );
}

function Cylinder({ cx, y, rx, ry, h, side, top, rim }: { cx: number; y: number; rx: number; ry: number; h: number; side: string; top: string; rim?: string }) {
  const d = `M ${cx - rx} ${y} L ${cx - rx} ${y + h} A ${rx} ${ry} 0 0 0 ${cx + rx} ${y + h} L ${cx + rx} ${y} Z`;
  return (
    <G>
      <Path d={d} fill={`url(#${side})`} />
      <Ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={top} />
      {rim ? <Ellipse cx={cx} cy={y} rx={rx - 1} ry={ry - 1} fill="none" stroke={rim} strokeWidth={1.5} opacity={0.6} /> : null}
    </G>
  );
}

/** Isometric block: top, left and right faces. (cx, y) is the top face's centre. */
function Block({ cx, y, a, h, faces }: { cx: number; y: number; a: number; h: number; faces: [string, string, string] }) {
  const b = a / 2;
  return (
    <G>
      <Path d={`M ${cx - a} ${y} L ${cx} ${y + b} L ${cx} ${y + b + h} L ${cx - a} ${y + h} Z`} fill={faces[1]} />
      <Path d={`M ${cx} ${y + b} L ${cx + a} ${y} L ${cx + a} ${y + h} L ${cx} ${y + b + h} Z`} fill={faces[2]} />
      <Path d={`M ${cx} ${y - b} L ${cx + a} ${y} L ${cx} ${y + b} L ${cx - a} ${y} Z`} fill={faces[0]} />
    </G>
  );
}

/** Answer sheet: white page, question lines and a ticked option bubble. */
function Paper({ x, y, w, h, rotate }: { x: number; y: number; w: number; h: number; rotate: number }) {
  return (
    <G transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <Rect x={x + 4} y={y + 6} width={w} height={h} rx={10} fill={P.navy900} opacity={0.25} />
      <Rect x={x} y={y} width={w} height={h} rx={10} fill={P.white} />
      <Rect x={x + 12} y={y + 14} width={w * 0.55} height={7} rx={3.5} fill={P.navy700} />
      {[0, 1, 2].map((i) => (
        <G key={i}>
          <Circle cx={x + 18} cy={y + 40 + i * 22} r={6} fill={i === 1 ? P.sky300 : 'none'} stroke={i === 1 ? P.navy700 : P.ice100} strokeWidth={2} />
          <Rect x={x + 30} y={y + 37 + i * 22} width={w * (i === 1 ? 0.5 : 0.42)} height={6} rx={3} fill={P.ice100} />
        </G>
      ))}
    </G>
  );
}

/** Admit-card style pass with a gradient face and a verified badge. */
function Pass({ x, y, w, rotate, gradient }: { x: number; y: number; w: number; rotate: number; gradient: string }) {
  const h = w * 0.63;
  return (
    <G transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <Rect x={x + 5} y={y + 8} width={w} height={h} rx={12} fill={P.navy900} opacity={0.3} />
      <Rect x={x} y={y} width={w} height={h} rx={12} fill={`url(#${gradient})`} />
      <Rect x={x + 14} y={y + 16} width={22} height={16} rx={4} fill={P.ice100} opacity={0.9} />
      <Rect x={x + 14} y={y + h - 26} width={w * 0.45} height={6} rx={3} fill={P.white} opacity={0.9} />
      <Rect x={x + 14} y={y + h - 15} width={w * 0.3} height={5} rx={2.5} fill={P.white} opacity={0.6} />
      <Circle cx={x + w - 22} cy={y + 24} r={11} fill={P.white} />
      <Path d={`M ${x + w - 27} ${y + 24} l 4 4 l 7 -8`} stroke={P.navy700} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function Clock({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <G>
      <Circle cx={cx + 3} cy={cy + 5} r={r} fill={P.navy900} opacity={0.25} />
      <Circle cx={cx} cy={cy} r={r} fill={P.white} />
      <Circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={P.ice100} strokeWidth={2} />
      <Path d={`M ${cx} ${cy} L ${cx} ${cy - r * 0.55} M ${cx} ${cy} L ${cx + r * 0.4} ${cy + r * 0.15}`} stroke={P.navy700} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={2.5} fill={P.sky300} />
    </G>
  );
}

function GroundShadow({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <Ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.16} fill={P.navy900} opacity={0.35} />;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** Slow vertical drift for the floating layer; still when Reduce Motion is on. */
function Float({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      t.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, delay, t]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  return <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function Stage({ base, float }: { base: ReactNode; float: ReactNode }) {
  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        {base}
      </Svg>
      <Float>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {float}
        </Svg>
      </Float>
    </View>
  );
}

/** Slide 1: timed practice. Stacked discs, a floating answer sheet, pass and clock. */
export function PracticeIllustration() {
  return (
    <Stage
      base={
        <>
          <Defs>
            <SideGradient id="s1a" shade={[P.cyan400, P.ice100, P.cyan400]} />
            <SideGradient id="s1b" shade={[P.steel500, P.cyan400, P.steel500]} />
            <SideGradient id="s1c" shade={[P.navy900, P.steel500, P.navy700]} />
          </Defs>
          <GroundShadow cx={140} cy={240} rx={100} />
          <Block cx={62} y={128} a={22} h={46} faces={[P.ice100, P.sky300, P.cyan400]} />
          <Block cx={222} y={136} a={18} h={34} faces={[P.white, P.ice100, P.sky300]} />
          <Cylinder cx={140} y={206} rx={90} ry={28} h={18} side="s1a" top={P.ice100} />
          <Cylinder cx={140} y={184} rx={82} ry={26} h={14} side="s1b" top={P.cyan400} />
          <Cylinder cx={140} y={156} rx={90} ry={28} h={20} side="s1c" top={P.steel500} rim={P.sky300} />
        </>
      }
      float={
        <>
          <Defs>
            <LinearGradient id="p1" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={P.sky300} />
              <Stop offset="1" stopColor={P.teal500} />
            </LinearGradient>
          </Defs>
          <Paper x={74} y={44} w={92} h={112} rotate={-10} />
          <Pass x={128} y={92} w={104} rotate={12} gradient="p1" />
          <Clock cx={214} cy={56} r={22} />
        </>
      }
    />
  );
}

/** Slide 2: examiners. A pedestal with a slot and a verified pass dropping in. */
export function ExaminerIllustration() {
  return (
    <Stage
      base={
        <>
          <Defs>
            <SideGradient id="s2a" shade={[P.navy700, P.sky300, P.navy700]} />
            <SideGradient id="s2b" shade={[P.ice100, P.white, P.ice100]} />
          </Defs>
          <GroundShadow cx={140} cy={238} rx={96} />
          <Cylinder cx={140} y={146} rx={72} ry={22} h={74} side="s2a" top={P.steel500} />
          <Cylinder cx={140} y={134} rx={66} ry={20} h={12} side="s2b" top={P.ice100} />
          <Ellipse cx={140} cy={134} rx={40} ry={11} fill={P.navy700} />
          <Block cx={78} y={196} a={28} h={26} faces={[P.sky300, P.cyan400, P.teal500]} />
          <Block cx={206} y={184} a={22} h={44} faces={[P.ice100, P.sky300, P.steel500]} />
        </>
      }
      float={
        <>
          <Defs>
            <LinearGradient id="p2" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={P.sky300} />
              <Stop offset="1" stopColor={P.navy700} />
            </LinearGradient>
          </Defs>
          <Pass x={98} y={30} w={110} rotate={-28} gradient="p2" />
          <Circle cx={62} cy={70} r={9} fill={P.ice100} />
          <Circle cx={226} cy={96} r={6} fill={P.sky300} />
        </>
      }
    />
  );
}

/** Slide 3: analytics. Isometric blocks, a glass chart panel, a medal and an answer sheet. */
export function AnalyticsIllustration() {
  return (
    <Stage
      base={
        <>
          <GroundShadow cx={150} cy={242} rx={110} />
          <Block cx={72} y={150} a={34} h={74} faces={[P.cyan400, P.teal500, P.steel500]} />
          <Block cx={160} y={176} a={96} h={36} faces={[P.ice100, P.sky300, P.steel500]} />
          <Block cx={196} y={150} a={46} h={26} faces={[P.white, P.ice100, P.sky300]} />
        </>
      }
      float={
        <>
          <Defs>
            <LinearGradient id="m3" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={P.ice100} />
              <Stop offset="1" stopColor={P.sky300} />
            </LinearGradient>
          </Defs>
          <Paper x={66} y={40} w={80} h={98} rotate={-8} />
          <G transform="rotate(6 196 92)">
            <Rect x={144} y={46} width={104} height={84} rx={14} fill={P.white} opacity={0.35} />
            <Rect x={144} y={46} width={104} height={84} rx={14} fill="none" stroke={P.white} strokeWidth={1.5} opacity={0.8} />
            <Path d="M 156 110 C 172 110, 176 72, 192 80 S 214 112, 236 64" stroke={P.navy700} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={236} cy={64} r={4.5} fill={P.sky300} stroke={P.navy700} strokeWidth={2} />
          </G>
          <Circle cx={126} cy={148} r={24} fill={P.navy700} opacity={0.35} />
          <Circle cx={122} cy={142} r={24} fill="url(#m3)" />
          <Circle cx={122} cy={142} r={16} fill="none" stroke={P.navy700} strokeWidth={2} opacity={0.5} />
          <Path d="M 122 132 l 3 6.5 l 7 1 l -5 4.8 l 1.2 7 l -6.2 -3.3 l -6.2 3.3 l 1.2 -7 l -5 -4.8 l 7 -1 Z" fill={P.navy700} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: W / H, maxHeight: 320, alignSelf: 'center' },
});
