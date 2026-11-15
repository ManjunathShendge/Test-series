import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ExaminerCard } from '@/features/catalogue/components/ExaminerCard';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { TestCard } from '@/features/catalogue/components/TestCard';
import { TestListSkeleton } from '@/features/catalogue/components/TestCardSkeleton';
import { useHomeFeed } from '@/lib/api/queries';
import { getExam, type TestSummary } from '@/lib/demo';
import { formatClock } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { paletteCounts, useAttemptStore } from '@/lib/store/attempt';
import { Avatar, Button, Card, Chip, Icon, Screen, StateView, Text } from '@/ui/primitives';
import { colors, layout, space } from '@/ui/tokens';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home (PRD 6.2): continue attempt, recommended tests, new from followed
 * examiners, admin-featured free tests. Live tests are Phase 2 and therefore
 * absent rather than shown as "coming soon".
 */
export default function HomeScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const attempted = useAppStore((s) => s.attemptedTestIds);
  const followed = useAppStore((s) => s.followedExaminerIds);
  const owned = useAppStore((s) => s.ownedTestIds);
  const ownedSeries = useAppStore((s) => s.ownedSeriesIds);
  const toggleFollow = useAppStore((s) => s.toggleFollow);

  const hasAccess = (t: TestSummary) =>
    t.pricePaise === 0 || owned.includes(t.id) || (t.seriesId !== undefined && ownedSeries.includes(t.seriesId));

  const feed = useHomeFeed(profile.targetExamIds, attempted, followed);
  const recommended = feed.data?.recommended ?? [];
  const fromFollowed = feed.data?.fromFollowed ?? [];
  const featured = feed.data?.featured ?? [];
  const suggestedExaminers = feed.data?.suggestedExaminers ?? [];
  // No data yet: first load, or waiting for a connection with nothing cached.
  const feedState = feed.data ? 'ready' : feed.isError ? 'error' : feed.fetchStatus === 'paused' ? 'offline' : 'loading';

  // Real in-progress attempt, if any: the timer keeps running while the student is away.
  const attempt = useAttemptStore(
    useShallow((s) => ({ status: s.status, test: s.test, paper: s.paper, answers: s.answers, deadlineAt: s.deadlineAt, sync: s.sync })),
  );
  const continueTest = attempt.status === 'in_progress' ? attempt.test : null;
  const answeredCount = attempt.paper ? (() => { const c = paletteCounts(attempt.paper, attempt.answers); return c.answered + c.markedAnswered; })() : 0;
  const secondsLeft = Math.max(0, Math.floor((attempt.deadlineAt - Date.now()) / 1000));
  const targetExams = profile.targetExamIds.map(getExam).filter((e): e is NonNullable<typeof e> => !!e);

  const openTest = (id: string) => router.push({ pathname: '/test/[id]', params: { id } });

  return (
    <Screen padded={false} contentStyle={styles.content}>
      <View style={[styles.gutter, styles.header]}>
        <View style={styles.headerText}>
          <Text variant="bodySmall" tone="secondary">
            {greeting()}
          </Text>
          <Text variant="display">{profile.name.split(' ')[0]}</Text>
        </View>
        <Avatar name={profile.name} size={44} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.gutter, styles.rail]}>
        {targetExams.map((exam) => (
          <Chip key={exam.id} label={exam.name} tone="primary" icon="school-outline" onPress={() => router.push({ pathname: '/exam/[id]', params: { id: exam.id } })} />
        ))}
        <Chip label="All exams" icon="grid-outline" onPress={() => router.push('/discover')} />
      </ScrollView>

      {continueTest ? (
        <View style={styles.gutter}>
          <Card accessibilityLabel={`Continue ${continueTest.title}, ${answeredCount} of ${continueTest.questionCount} answered, ${formatClock(secondsLeft)} left`} onPress={() => router.push({ pathname: '/test/[id]/attempt', params: { id: continueTest.id } })}>
            <View style={styles.continueTop}>
              <Chip label="In progress" tone="warning" icon="pause-circle-outline" />
              <View style={styles.saved}>
                <Icon name={attempt.sync === 'synced' ? 'cloud-done-outline' : 'phone-portrait-outline'} size={14} color={colors.textSecondary} />
                <Text variant="caption" tone="secondary">
                  {attempt.sync === 'synced' ? 'Synced' : 'Saved on this device'}
                </Text>
              </View>
            </View>
            <Text variant="heading" style={{ marginTop: space.md }}>
              {continueTest.title}
            </Text>
            <View style={styles.continueMeta}>
              <Text variant="bodySmall" tone="secondary" tabular>
                {answeredCount} of {continueTest.questionCount} answered
              </Text>
              <Text variant="bodySmall" tone="secondary">
                ·
              </Text>
              <Text variant="bodySmallStrong" tabular>
                {formatClock(secondsLeft)} left
              </Text>
            </View>
            <View style={{ marginTop: space.lg }}>
              <Button label="Continue attempt" icon="play" fullWidth onPress={() => router.push({ pathname: '/test/[id]/attempt', params: { id: continueTest.id } })} />
            </View>
          </Card>
        </View>
      ) : null}

      {feedState === 'loading' ? (
        <View style={styles.section}>
          <View style={styles.gutter}>
            <SectionHeader title="Recommended for you" subtitle="Popular in your target exams" />
          </View>
          <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gutter}>
            <TestListSkeleton count={2} compact />
          </ScrollView>
          <View style={styles.gutter}>
            <TestListSkeleton count={1} />
          </View>
        </View>
      ) : null}

      {feedState === 'error' || feedState === 'offline' ? (
        <View style={styles.gutter}>
          <StateView
            kind={feedState === 'offline' ? 'offline' : 'error'}
            title={feedState === 'offline' ? 'Waiting for a connection' : 'Could not load your tests'}
            message={feedState === 'offline' ? 'Your recommendations load as soon as you are back online. A test in progress still works.' : 'Something went wrong on our side. Your progress is safe.'}
            actionLabel="Try again"
            onAction={() => void feed.refetch()}
          />
        </View>
      ) : null}

      {feedState === 'ready' ? (
      <View style={styles.section}>
        <View style={styles.gutter}>
          <SectionHeader title="Recommended for you" subtitle="Popular in your target exams" actionLabel="See all" onAction={() => router.push('/discover')} />
        </View>
        {recommended.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.gutter, styles.rail]}>
            {recommended.map((t) => (
              <TestCard key={t.id} test={t} hasAccess={hasAccess(t)} onPress={() => openTest(t.id)} compact />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.gutter}>
            <Card>
              <Text variant="bodyStrong">You have attempted every popular test here</Text>
              <Text variant="bodySmall" tone="secondary" style={{ marginTop: space.xs }}>
                Browse Discover for sectionals and previous-year papers, or add another target exam in Profile.
              </Text>
            </Card>
          </View>
        )}
      </View>
      ) : null}

      {fromFollowed.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.gutter}>
            <SectionHeader title="New from examiners you follow" />
          </View>
          <View style={[styles.gutter, styles.stack]}>
            {fromFollowed.slice(0, 2).map((t) => (
              <TestCard key={t.id} test={t} hasAccess={hasAccess(t)} onPress={() => openTest(t.id)} />
            ))}
          </View>
        </View>
      ) : null}

      {featured.length > 0 ? (
      <View style={styles.section}>
        <View style={styles.gutter}>
          <SectionHeader title="Free tests" subtitle="Hand-picked by our team" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.gutter, styles.rail]}>
          {featured.map((t) => (
            <TestCard key={t.id} test={t} hasAccess onPress={() => openTest(t.id)} compact />
          ))}
        </ScrollView>
      </View>
      ) : null}

      {suggestedExaminers.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.gutter}>
            <SectionHeader title="Examiners to follow" />
          </View>
          <View style={[styles.gutter, styles.stack]}>
            {suggestedExaminers.map((e) => (
              <ExaminerCard key={e.id} examiner={e} isFollowed={false} onPress={() => router.push({ pathname: '/examiner/[id]', params: { id: e.id } })} onToggleFollow={() => toggleFollow(e.id)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xl, paddingTop: space.lg, maxWidth: undefined },
  gutter: { paddingHorizontal: layout.gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { gap: 2 },
  rail: { flexDirection: 'row', gap: space.md, paddingRight: layout.gutter },
  section: { gap: space.md },
  stack: { gap: space.md },
  continueTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  continueMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
});
