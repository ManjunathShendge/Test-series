import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { TestCard } from '@/features/catalogue/components/TestCard';
import type { ExaminerTier } from '@/lib/catalogue/types';
import { useExaminerDetail } from '@/lib/api/queries';
import { formatCount, formatPaise } from '@/lib/format';
import { useAccess, useEntitlements, useFollow } from '@/lib/api/account';
import { Avatar, Button, Card, Chip, Screen, StateView, Text, type ChipTone, type IconName } from '@/ui/primitives';
import { space } from '@/ui/tokens';

const tierMeta: Record<ExaminerTier, { label: string; tone: ChipTone; icon: IconName }> = {
  top: { label: 'Top examiner', tone: 'success', icon: 'ribbon-outline' },
  verified: { label: 'Verified examiner', tone: 'primary', icon: 'shield-checkmark-outline' },
  new: { label: 'New examiner', tone: 'neutral', icon: 'sparkles-outline' },
};

/** Examiner profile (PRD 6.2): bio, credentials, published tests and series, Follow. */
export default function ExaminerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useExaminerDetail(id);
  const examiner = detail.data?.examiner;
  const follow = useFollow();
  const followed = follow.isFollowed(id);
  const hasAccess = useAccess();
  const ownedSeries = useEntitlements().data?.seriesIds ?? [];

  if (detail.isError) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Examiner not found" message="This profile is unavailable or could not be loaded." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  if (!examiner) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="empty" title="Loading examiner" message="Fetching the latest profile." />
      </Screen>
    );
  }

  const tier = tierMeta[examiner.tier];
  const tests = detail.data?.tests ?? [];
  const series = detail.data?.series ?? [];
  const exams = detail.data?.exams ?? [];

  return (
    <>
      <Stack.Screen options={{ title: examiner.name }} />
      <Screen edges={['left', 'right']}>
        <View style={styles.hero}>
          <Avatar name={examiner.name} size={72} />
          <View style={styles.heroText}>
            <Text variant="title">{examiner.name}</Text>
            <Chip label={tier.label} tone={tier.tone} icon={tier.icon} />
          </View>
        </View>
        <Text tone="secondary">{examiner.credentials}</Text>
        <Text>{examiner.bio}</Text>

        <View style={styles.stats}>
          <View style={styles.stat} accessible accessibilityLabel={`${formatCount(examiner.followers)} followers`}>
            <Text variant="title" tabular>
              {formatCount(examiner.followers)}
            </Text>
            <Text variant="caption" tone="secondary">
              Followers
            </Text>
          </View>
          <View style={styles.stat} accessible accessibilityLabel={`${examiner.publishedTests} published tests`}>
            <Text variant="title" tabular>
              {examiner.publishedTests}
            </Text>
            <Text variant="caption" tone="secondary">
              Published tests
            </Text>
          </View>
          <View style={styles.stat} accessible accessibilityLabel={`Exams: ${exams.map((exam) => exam.name).join(', ')}`}>
            <Text variant="title" tabular>
              {examiner.examIds.length}
            </Text>
            <Text variant="caption" tone="secondary">
              Exams
            </Text>
          </View>
        </View>

        <Button
          label={followed ? 'Following' : 'Follow'}
          variant={followed ? 'secondary' : 'primary'}
          icon={followed ? 'checkmark' : 'add'}
          fullWidth
          onPress={() => follow.toggle(examiner.id)}
          accessibilityLabel={followed ? `Unfollow ${examiner.name}` : `Follow ${examiner.name}`}
        />

        <View style={styles.chips}>
          {exams.map((exam) => {
            return <Chip key={exam.id} label={exam.name} tone="primary" icon="school-outline" onPress={() => router.push({ pathname: '/exam/[id]', params: { id: exam.id } })} />;
          })}
        </View>

        {series.length > 0 ? (
          <View style={styles.block}>
            <Text variant="heading">Series</Text>
            {series.map((s) => (
              <Card key={s.id} onPress={() => router.push({ pathname: '/series/[id]', params: { id: s.id } })} accessibilityLabel={`${s.title}, ${s.testIds.length} tests, ${formatPaise(s.pricePaise)}`}>
                <View style={styles.seriesTop}>
                  <Chip label={`${s.testIds.length} tests`} icon="albums-outline" />
                  {ownedSeries.includes(s.id) ? <Chip label="Owned" tone="success" icon="checkmark-circle-outline" /> : <Text variant="bodyStrong">{formatPaise(s.pricePaise)}</Text>}
                </View>
                <Text variant="heading" style={{ marginTop: space.md }}>
                  {s.title}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {s.description}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={styles.block}>
          <Text variant="heading">Published tests</Text>
          {tests.map((t) => (
            <TestCard key={t.id} test={t} hasAccess={hasAccess(t)} onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} />
          ))}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroText: { flex: 1, gap: space.sm },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  block: { gap: space.md },
  seriesTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
