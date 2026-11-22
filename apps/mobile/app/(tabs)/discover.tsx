import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ExaminerCard } from '@/features/catalogue/components/ExaminerCard';
import { ExamShapes } from '@/features/catalogue/components/ExamShapes';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { TestCard } from '@/features/catalogue/components/TestCard';
import { TestListSkeleton } from '@/features/catalogue/components/TestCardSkeleton';
import { useIsOnline } from '@/lib/api/client';
import { useSearch } from '@/lib/api/queries';
import { examiners, exams, type SearchFilters, type TestSummary } from '@/lib/demo';
import { formatCount } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Card, Chip, Icon, Screen, StateView, Text, TextField, type IconName } from '@/ui/primitives';
import { colors, fonts, layout, space } from '@/ui/tokens';

const KINDS: { key: TestSummary['kind']; label: string }[] = [
  { key: 'full-mock', label: 'Mini mock' },
  { key: 'sectional', label: 'Sectional' },
  { key: 'pyq', label: 'Previous year' },
];

/** Price bands (PRD 6.2 "free or paid" and "price" filters), single select. */
const PRICES: { key: NonNullable<SearchFilters['price']>; label: string; icon?: IconName }[] = [
  { key: 'free', label: 'Free', icon: 'gift-outline' },
  { key: 'under50', label: 'Under ₹50' },
  { key: '50to200', label: '₹50 to ₹200' },
  { key: 'over200', label: 'Over ₹200' },
];

/**
 * Discover (PRD 6.2): search with filters for exam, type, price band and
 * language; browse exams and examiners when idle. Rating and "in Pass" filters
 * arrive with Phase 2 (ratings, Pass product per DECISIONS E01).
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
  // Debounce typing so each keystroke is not a request once this is a real API.
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const search = useSearch({ ...filters, query: debounced });
  const online = useIsOnline();
  // Previous results stay on screen while a new search loads, dimmed, but are
  // never shown as the answer to a filter they were not fetched for.
  const stale = search.isPlaceholderData;
  const listState =
    search.data && !stale ? 'ready'
    : search.isError ? 'error'
    : search.fetchStatus === 'paused' ? 'offline'
    : stale ? 'refreshing'
    : 'loading';
  const results = listState === 'ready' || listState === 'refreshing' ? (search.data ?? []) : [];
  const hasAccess = (t: TestSummary) => t.pricePaise === 0 || owned.includes(t.id) || (t.seriesId !== undefined && ownedSeries.includes(t.seriesId));

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((f) => (f[key] === value ? { ...f, [key]: undefined } : { ...f, [key]: value }));

  const header = (
    <View style={styles.header}>
      <View accessible accessibilityRole="header" accessibilityLabel="Discover tests picked for your exam">
        <Text variant="caption" tone="secondary" style={styles.kicker}>
          DISCOVER
        </Text>
        <Text style={styles.editorial}>
          Tests{'\n'}
          <Text style={[styles.editorial, styles.editorialSoft]}>picked for{'\n'}your exam</Text>
        </Text>
      </View>
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
        <Chip label="Hindi" icon="language-outline" selected={filters.language === 'hi'} onPress={() => set('language', 'hi')} />
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={filters.kind === k.key} onPress={() => set('kind', k.key)} />
        ))}
      </View>
      <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Price">
        {PRICES.map((p) => (
          <Chip key={p.key} label={p.label} {...(p.icon ? { icon: p.icon } : {})} selected={filters.price === p.key} onPress={() => set('price', p.key)} />
        ))}
      </View>

      {active ? (
        <View style={styles.resultsRow}>
          <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite">
            {listState === 'offline' ? 'Offline' : listState !== 'ready' ? 'Searching…' : results.length === 1 ? '1 test' : `${results.length} tests`}
          </Text>
          <Chip label="Clear filters" icon="close" onPress={() => { setQuery(''); setFilters({}); }} />
        </View>
      ) : (
        <>
          <SectionHeader title="Browse by exam" />
          <ExamShapes exams={exams} onOpen={(id) => router.push({ pathname: '/exam/[id]', params: { id } })} />
          <View style={styles.examGrid}>
            {exams.slice(3).map((e) => (
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
          <View style={[styles.item, listState === 'refreshing' && styles.dimmed]}>
            <TestCard test={item} hasAccess={hasAccess(item)} onPress={() => router.push({ pathname: '/test/[id]', params: { id: item.id } })} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          listState === 'loading' ? (
            <View style={styles.item}>
              <TestListSkeleton count={3} />
            </View>
          ) : listState === 'offline' || listState === 'error' ? (
            <StateView
              kind={listState === 'offline' ? 'offline' : 'error'}
              title={listState === 'offline' ? 'Waiting for a connection' : 'Search is not responding'}
              message={listState === 'offline' ? 'Results load as soon as you are back online.' : 'Try again in a moment.'}
              actionLabel="Try again"
              onAction={() => void search.refetch()}
            />
          ) : (
            <StateView
              kind="empty"
              title="No tests match"
              message="Try a different exam, type or price filter, or clear the search."
              actionLabel="Clear filters"
              onAction={() => { setQuery(''); setFilters({}); }}
            />
          )
        }
        contentContainerStyle={[styles.list, !online && styles.listOffline]}
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
  kicker: { letterSpacing: 1.2, marginBottom: space.xs },
  // Editorial headline after the reference; weight and tint contrast instead of an italic
  // (Outfit has no italic face).
  editorial: { fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8, color: colors.text },
  editorialSoft: { fontFamily: fonts.displayMedium, color: colors.textSecondary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  examGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  examCard: { flexBasis: '47%', flexGrow: 1 },
  examIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stack: { gap: space.md },
  dimmed: { opacity: 0.5 },
  // Room for the floating offline banner so it never covers the last action.
  listOffline: { paddingBottom: 120 },
  item: { paddingHorizontal: layout.gutter, paddingTop: space.md },
});
