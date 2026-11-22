import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { BackHandler, FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { AnalyticsIllustration, ExaminerIllustration, PracticeIllustration } from '@/features/welcome/Illustrations';
import { useAppStore } from '@/lib/store/app';
import { Button, Icon, Text } from '@/ui/primitives';
import { colors, layout, palette, radius, space } from '@/ui/tokens';

interface Slide {
  key: string;
  title: string;
  body: string;
  Art: ComponentType;
}

const SLIDES: Slide[] = [
  {
    key: 'practice',
    title: "Practise like it's exam day",
    body: 'Timed mocks that follow the real pattern for SSC, Banking and Railways. One free test is waiting for you.',
    Art: PracticeIllustration,
  },
  {
    key: 'examiners',
    title: 'Tests by examiners who cleared it',
    body: 'Every question is reviewed before it is published. Follow examiners to see their new tests first.',
    Art: ExaminerIllustration,
  },
  {
    key: 'analytics',
    title: 'Know exactly where to improve',
    body: 'Your score trend against the cutoff, your weakest topics and every mistake, in one place.',
    Art: AnalyticsIllustration,
  },
];

const LAST = SLIDES.length - 1;

/**
 * First-launch introduction (owner design reference 1, 19 November 2026): three slides on
 * the navy brand gradient with swipe, Continue, Skip and a progress indicator; the last
 * slide hands over to sign-up or log-in. Shown until the student reaches sign-in once.
 * There is no "Later": the app has no guest mode, so that action would lead nowhere.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const markIntroSeen = useAppStore((s) => s.markIntroSeen);
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const goTo = useCallback((i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  }, []);

  // Android back steps back through the slides before leaving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return false;
      goTo(index - 1);
      return true;
    });
    return () => sub.remove();
  }, [index, goTo]);

  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const enter = (mode: 'signup' | 'login') => {
    markIntroSeen();
    router.replace({ pathname: '/(auth)/sign-in', params: { mode } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Backdrop />
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.fill}>
        <View style={styles.header}>
          <Image source={require('../../assets/brand/mark-inverse.png')} style={styles.logo} resizeMode="contain" accessibilityRole="image" accessibilityLabel="MakeMePrepare" />
          <View style={styles.dots} accessible accessibilityRole="progressbar" accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
            {SLIDES.map((s, i) => (
              <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          {index < LAST ? (
            <Pressable onPress={() => goTo(LAST)} accessibilityRole="button" accessibilityLabel="Skip introduction" hitSlop={12} style={styles.skip}>
              <Text variant="bodySmallStrong" tone="inverse">
                Skip
              </Text>
              <Icon name="chevron-forward" size={16} color={colors.onInverse} />
            </Pressable>
          ) : (
            <View style={styles.skip} />
          )}
        </View>

        <FlatList
          ref={list}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSwipeEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.copy}>
                <Text variant="hero" tone="inverse" align="center" accessibilityRole="header">
                  {item.title}
                </Text>
                <Text variant="body" tone="inverseSecondary" align="center">
                  {item.body}
                </Text>
              </View>
              <View style={styles.art}>
                <item.Art />
              </View>
            </View>
          )}
          style={styles.fill}
        />

        <View style={styles.actions}>
          {index < LAST ? (
            <Button label="Continue" variant="light" size="lg" fullWidth onPress={() => goTo(index + 1)} />
          ) : (
            <>
              <Button label="Sign up" variant="light" size="lg" fullWidth onPress={() => enter('signup')} />
              <Button label="Log in" variant="inverseGhost" size="lg" fullWidth onPress={() => enter('login')} />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Navy brand gradient with a soft sky glow behind the illustration. */
function Backdrop() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.navy700} />
          <Stop offset="0.55" stopColor={palette.navy900} />
          <Stop offset="1" stopColor={palette.navy900} />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="55%" rx="60%" ry="35%">
          <Stop offset="0" stopColor={palette.sky300} stopOpacity={0.28} />
          <Stop offset="1" stopColor={palette.sky300} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#bg)" />
      <Ellipse cx="50%" cy="58%" rx="70%" ry="30%" fill="url(#glow)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy900 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.gutter, paddingTop: space.sm, minHeight: 48 },
  logo: { width: 59, height: 32, minWidth: 64 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { width: 24, backgroundColor: colors.onInverse },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, minWidth: 64, justifyContent: 'flex-end' },
  slide: { flex: 1, paddingHorizontal: layout.gutter + space.sm, paddingTop: space.xl, gap: space.xl },
  copy: { gap: space.md, alignItems: 'center' },
  art: { flex: 1, justifyContent: 'center' },
  actions: { paddingHorizontal: layout.gutter, paddingBottom: space.lg, paddingTop: space.md, gap: space.xs },
});
