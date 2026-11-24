import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ExaminerCard } from '@/features/catalogue/components/ExaminerCard';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { TestCard } from '@/features/catalogue/components/TestCard';
import { TestListSkeleton } from '@/features/catalogue/components/TestCardSkeleton';
import { useAccess, useFollow, useFollowing } from '@/lib/api/account';
import { toTestSummary, useExaminers, useExams, useHomeFeed } from '@/lib/api/queries';
import { formatClock, formatDate } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { useMyAttempts, useRunningAttempt } from '@/features/attempt/queries';
import { usePractice, useProgress } from '@/features/results/queries';
import { Avatar, Button, Card, Chip, FeatureTile, Icon, IconButton, Screen, StateView, Text } from '@/ui/primitives';
import { ProgressRing } from '@/ui/patterns/ProgressRing';
import { colors, layout, radius, space } from '@/ui/tokens';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home (PRD 6.2): continue attempt, recommended tests, new from followed
 * examiners, admin-featured free tests. Live tests are Phase 2 and therefore
 * absent rather than shown as "coming soon". Layout follows owner design reference 2:
 * greeting header, a navy hero card, a tinted tile grid, then the content rails.
 */
export default function HomeScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const attempted = [...new Set((useMyAttempts().data ?? []).map((a) => a.testId))];
  const hasAccess = useAccess();
  const follow = useFollow();
  const following = useFollowing().data;
  const examiners = useExaminers().data ?? [];

  const feed = useHomeFeed(profile.targetExamIds, attempted);
  const examsQuery = useExams();
  const realExams = examsQuery.data ?? [];
  const recommended = feed.data?.recommended ?? [];
  const featured = feed.data?.featured ?? [];
  // New from followed examiners (PRD 6.2), straight from the server's follow list.
  const fromFollowed = (following?.tests ?? []).map(toTestSummary);
  const suggestedExaminers = examiners.filter((e) => !follow.isFollowed(e.id)).slice(0, 2);
  // No data yet: first load, or waiting for a connection with nothing cached.
  const feedState = feed.data ? 'ready' : feed.isError ? 'error' : feed.fetchStatus === 'paused' ? 'offline' : 'loading';

  // Running attempt from the server, if any: its timer keeps running while the student is away.
  const continueTest = useRunningAttempt();
  const secondsLeft = continueTest ? Math.max(0, Math.floor((Date.parse(continueTest.expiresAt) - Date.now()) / 1000)) : 0;
  const totalSeconds = continueTest ? Math.max(1, (Date.parse(continueTest.expiresAt) - Date.parse(continueTest.startedAt)) / 1000) : 1;
  const targetExams = profile.targetExamIds.map((id) => realExams.find((exam) => exam.id === id)).filter((e): e is NonNullable<typeof e> => !!e);

  // Results come from the server; nothing is scored on the phone.
  const progress = useProgress().data;
  const latest = progress?.trend[progress.trend.length - 1];
  const mistakes = usePractice('mistakes').data?.length ?? 0;
  const bookmarks = usePractice('bookmarks').data?.length ?? 0;
  const weakest = progress?.weakest ?? null;
  const firstFree = featured[0];

  const openTest = (id: string) => router.push({ pathname: '/test/[id]', params: { id } });
  const openAttempt = (id: string) => router.push({ pathname: '/attempt/[id]', params: { id } });

  return (
    <Screen padded={false} contentStyle={styles.content}>
      <View style={[styles.gutter, styles.header]}>
        <View style={styles.identity}>
          <Avatar name={profile.name || 'Student'} size={44} />
          <View style={styles.headerText}>
            <Text variant="caption" tone="secondary">
              {greeting()}
            </Text>
            <Text variant="heading" numberOfLines={1}>
              Hello{profile.name ? `, ${profile.name.split(' ')[0]}` : ''}!
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="search-outline" label="Search tests" onPress={() => router.push('/discover')} />
          <IconButton icon="notifications-outline" label="Notification settings" onPress={() => router.push('/profile/notifications')} />
        </View>
      </View>

      <View style={styles.gutter}>
        {continueTest ? (
          <Pressable
            onPress={() => openAttempt(continueTest.attemptId)}
            accessibilityRole="button"
            accessibilityLabel={`Continue ${continueTest.testTitle}, ${formatClock(secondsLeft)} left`}
            style={({ pressed }) => [styles.hero, pressed && styles.heroPressed]}
          >
            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <View style={styles.heroTag}>
                  <Icon name="pause-circle-outline" size={14} color={colors.onAccent} />
                  <Text variant="caption" style={{ color: colors.onAccent }}>
                    In progress
                  </Text>
                </View>
                <Text variant="title" tone="inverse" numberOfLines={2}>
                  {continueTest.testTitle}
                </Text>
                <View style={styles.saved}>
                  <Icon name="cloud-done-outline" size={14} color={colors.onInverseSecondary} />
                  <Text variant="caption" tone="inverseSecondary">
                    Answers saved · timer running
                  </Text>
                </View>
              </View>
              <ProgressRing value={secondsLeft / totalSeconds} label={`${formatClock(secondsLeft)} left`}>
                <Text variant="bodyStrong" tone="inverse" tabular>
                  {formatClock(secondsLeft)}
                </Text>
                <Text variant="caption" tone="inverseSecondary">
                  left
                </Text>
              </ProgressRing>
            </View>
            <Text variant="bodySmall" tone="inverseSecondary" tabular>
              {continueTest.totalQuestions} questions
            </Text>
            <Button label="Continue attempt" variant="accent" icon="play" fullWidth onPress={() => openAttempt(continueTest.attemptId)} />
          </Pressable>
        ) : latest ? (
          <Pressable
            onPress={() => router.push({ pathname: '/attempt/[id]/summary', params: { id: latest.attemptId } })}
            accessibilityRole="button"
            accessibilityLabel={`Your progress. Last test ${latest.testTitle}: ${latest.percentage} percent. Opens the result.`}
            style={({ pressed }) => [styles.hero, pressed && styles.heroPressed]}
          >
            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <View style={styles.heroTitleRow}>
                  <View style={styles.heroIcon}>
                    <Icon name="trending-up" size={16} color={colors.onInverse} />
                  </View>
                  <Text variant="bodyStrong" tone="inverse">
                    Your progress
                  </Text>
                </View>
                <Text variant="metric" tone="inverse" tabular>
                  {Math.round(latest.percentage)}%
                </Text>
                <Text variant="caption" tone="inverseSecondary" numberOfLines={2}>
                  {latest.testTitle} · {formatDate(latest.submittedAt)}
                </Text>
              </View>
              <ProgressRing value={Math.max(0, latest.percentage) / 100} label={`${progress?.totals.tests ?? 0} tests finished`}>
                <Text variant="title" tone="inverse" tabular>
                  {progress?.totals.tests ?? 0}
                </Text>
                <Text variant="caption" tone="inverseSecondary">
                  tests
                </Text>
              </ProgressRing>
            </View>
          </Pressable>
        ) : firstFree ? (
          <View style={styles.hero}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroIcon}>
                <Icon name="gift-outline" size={16} color={colors.onInverse} />
              </View>
              <Text variant="bodyStrong" tone="inverse">
                Your first test is free
              </Text>
            </View>
            <Text variant="title" tone="inverse" numberOfLines={2}>
              {firstFree.title}
            </Text>
            <Button label="Start now" variant="accent" icon="arrow-forward" iconPosition="trailing" fullWidth onPress={() => openTest(firstFree.id)} />
          </View>
        ) : null}
      </View>

      <View style={[styles.gutter, styles.grid]}>
        <FeatureTile
          tone="ice"
          icon="close-circle-outline"
          title="Mistake notebook"
          value={String(mistakes)}
          description="Questions you got wrong"
          action="Practise"
          onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'mistakes' } })}
          style={styles.tile}
        />
        <FeatureTile
          tone="sky"
          icon="bookmark-outline"
          title="Bookmarks"
          value={String(bookmarks)}
          description="Saved to revise later"
          action="Open"
          onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'bookmarks' } })}
          style={styles.tile}
        />
        <FeatureTile
          tone="navy"
          icon="analytics-outline"
          title="Weak topics"
          description={weakest ? `Start with ${weakest.topic}` : 'Builds up as you attempt tests'}
          action="See progress"
          onPress={() => router.push('/progress')}
          style={styles.tile}
        />
        <FeatureTile
          tone="cyan"
          icon="school-outline"
          title="Browse exams"
          description="Mocks, sectionals and previous papers"
          action="Discover"
          onPress={() => router.push('/discover')}
          style={styles.tile}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.gutter, styles.rail]}>
        {targetExams.map((exam) => (
          <Chip key={exam.id} label={exam.name} tone="primary" icon="school-outline" onPress={() => router.push({ pathname: '/exam/[id]', params: { id: exam.id } })} />
        ))}
        <Chip label="All exams" icon="grid-outline" onPress={() => router.push('/discover')} />
      </ScrollView>

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
              <ExaminerCard key={e.id} examiner={e} isFollowed={false} onPress={() => router.push({ pathname: '/examiner/[id]', params: { id: e.id } })} onToggleFollow={() => follow.toggle(e.id)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ height: space.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xl, paddingTop: space.md, maxWidth: undefined },
  gutter: { paddingHorizontal: layout.gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  headerText: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: space.sm },
  hero: { backgroundColor: colors.inverse, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heroPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroCopy: { flex: 1, gap: space.sm },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inverseRaised, alignItems: 'center', justifyContent: 'center' },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  // Two columns on phones; wraps to one column when the screen is too narrow for both.
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 150 },
  rail: { flexDirection: 'row', gap: space.md, paddingRight: layout.gutter },
  section: { gap: space.md },
  stack: { gap: space.md },
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
