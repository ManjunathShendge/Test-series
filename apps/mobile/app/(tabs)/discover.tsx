import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ExaminerCard } from '@/features/catalogue/components/ExaminerCard';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { TestCard } from '@/features/catalogue/components/TestCard';
import { examiners, exams, searchTests, type SearchFilters, type TestSummary } from '@/lib/demo';
import { formatCount } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Card, Chip, Icon, Screen, StateView, Text, TextField } from '@/ui/primitives';
import { colors, layout, space } from '@/ui/tokens';

const KINDS: { key: TestSummary['kind']; label: string }[] = [
  { key: 'full-mock', label: 'Mini mock' },
  { key: 'sectional', label: 'Sectional' },
  { key: 'pyq', label: 'Previous year' },
];

/**
 * Discover (PRD 6.2): search with filters for exam, type, free/paid and
 * language; browse exams and examiners when idle. Rating filter is Phase 2 and
 * therefore not shown.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const owned = useAppStore((s) => s.ownedTestIds);
  const ownedSeries = useAppStore((s) => s.ownedSeriesIds);
  const followed = useAppStore((s) => s.followedExaminerIds);
  const toggleFollow = useAppStore((s) => s.toggleFollow);

  const active = query.trim().length > 0 || Object.values(filters).some(Boolean);
  const results = useMemo(() => searchTests({ ...filters, query }), [filters, query]);
  const hasAccess = (t: TestSummary) => t.pricePaise === 0 || owned.includes(t.id) || (t.seriesId !== undefined && ownedSeries.includes(t.seriesId));

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((f) => (f[key] === value ? { ...f, [key]: undefined } : { ...f, [key]: value }));

  const header = (
    <View style={styles.header}>
      <Text variant="display">Discover</Text>
      <TextField
        label="Search tests, exams and examiners"
        labelHidden
        leadingIcon="search-outline"
        placeholder="Search tests, exams, examiners"
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />

      <View style={styles.filters}>
        {exams.map((e) => (
          <Chip key={e.id} label={e.shortName} selected={filters.examId === e.id} onPress={() => set('examId', e.id)} />
        ))}
      </View>
      <View style={styles.filters}>
        <Chip label="Free" icon="gift-outline" selected={filters.price === 'free'} onPress={() => set('price', 'free')} />
        <Chip label="Paid" icon="pricetag-outline" selected={filters.price === 'paid'} onPress={() => set('price', 'paid')} />
        <Chip label="Hindi" icon="language-outline" selected={filters.language === 'hi'} onPress={() => set('language', 'hi')} />
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={filters.kind === k.key} onPress={() => set('kind', k.key)} />
        ))}
      </View>

      {active ? (
        <View style={styles.resultsRow}>
          <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite">
            {results.length === 1 ? '1 test' : `${results.length} tests`}
          </Text>
          <Chip label="Clear filters" icon="close" onPress={() => { setQuery(''); setFilters({}); }} />
        </View>
      ) : (
        <>
          <SectionHeader title="Browse by exam" />
          <View style={styles.examGrid}>
            {exams.map((e) => (
              <Card key={e.id} onPress={() => router.push({ pathname: '/exam/[id]', params: { id: e.id } })} accessibilityLabel={`${e.name}, ${e.testCount} tests, ${formatCount(e.followerCount)} following`} style={styles.examCard}>
                <View style={styles.examIcon}>
                  <Icon name="school-outline" size={22} color={colors.primary} />
                </View>
                <Text variant="bodyStrong" numberOfLines={2} style={{ marginTop: space.sm }}>
                  {e.name}
                </Text>
                <Text variant="caption" tone="secondary">
                  {e.testCount} tests · {formatCount(e.followerCount)} following
                </Text>
              </Card>
            ))}
          </View>

          <SectionHeader title="Examiners" subtitle="Follow to see new tests on Home" />
          <View style={styles.stack}>
            {examiners.map((e) => (
              <ExaminerCard key={e.id} examiner={e} isFollowed={followed.includes(e.id)} onPress={() => router.push({ pathname: '/examiner/[id]', params: { id: e.id } })} onToggleFollow={() => toggleFollow(e.id)} />
            ))}
          </View>

          <SectionHeader title="All tests" subtitle={`${results.length} published`} />
        </>
      )}
    </View>
  );

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.content}>
      <FlatList
        data={results}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <TestCard test={item} hasAccess={hasAccess(item)} onPress={() => router.push({ pathname: '/test/[id]', params: { id: item.id } })} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <StateView
            kind="empty"
            title="No tests match"
            message="Try a different exam, type or price filter, or clear the search."
            actionLabel="Clear filters"
            onAction={() => { setQuery(''); setFilters({}); }}
          />
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: undefined, gap: 0 },
  list: { paddingBottom: space.xl },
  header: { paddingHorizontal: layout.gutter, paddingTop: space.lg, gap: space.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  examGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  examCard: { flexBasis: '47%', flexGrow: 1 },
  examIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stack: { gap: space.md },
  item: { paddingHorizontal: layout.gutter, paddingTop: space.md },
});
