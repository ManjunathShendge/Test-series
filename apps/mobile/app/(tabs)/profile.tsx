import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { shareMyData } from '@/features/account/export';
import { useDevices, useMyPurchases, useUpdateProfile } from '@/lib/api/account';
import { useExams } from '@/lib/api/queries';
import type { Language } from '@/lib/catalogue/types';
import { deletionDate, DEVICE_LIMIT } from '@/lib/policy';
import { formatDate, formatPaise } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { signOutEverywhere } from '@/lib/store/session';
import { Avatar, Button, Card, Chip, Icon, ListRow, Screen, Text } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

const stageLabel = { starting: 'Just starting', revising: 'Revising', 'final-lap': 'Final lap' } as const;

/**
 * Profile (PRD 6.7): target exams, language, purchase history with invoices
 * and refunds, devices, notifications, help, policies, and in-app account
 * deletion with a grace period.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const purchases = useMyPurchases();
  const exams = useExams().data ?? [];
  const devices = useDevices();
  const saveProfile = useUpdateProfile();
  const activeDevices = devices.data?.filter((d) => d.isActive).length;

  // Saved on the server; the profile mirror updates from its answer.
  const changeLanguage = (lang: Language) => {
    if (lang === profile.language || saveProfile.isPending) return;
    saveProfile.mutate(
      { preferredLanguage: lang },
      { onError: (e) => Alert.alert('Could not change the language', e instanceof Error ? e.message : 'Please try again.') },
    );
  };
  const deletionRequestedAt = profile.deletionRequestedAt;

  return (
    <Screen>
      <Text variant="display">Profile</Text>

      {deletionRequestedAt ? (
        <Card onPress={() => router.push('/profile/delete-account')} accessibilityLabel="Account deletion scheduled. Open to cancel">
          <View style={styles.identity}>
            <Icon name="warning-outline" size={22} color={colors.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">Account deletion scheduled for {formatDate(deletionDate(deletionRequestedAt).toISOString())}</Text>
              <Text variant="bodySmall" tone="secondary">
                Tap to cancel.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.identity}>
          <Avatar name={profile.name || 'Student'} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{profile.name}</Text>
            <Text variant="bodySmall" tone="secondary">
              {profile.email}
            </Text>
            {profile.preparationStage ? <Chip label={stageLabel[profile.preparationStage]} icon="flag-outline" /> : null}
          </View>
        </View>
      </Card>

      <View style={styles.block}>
        <Text variant="heading">Target exams</Text>
        <View style={styles.chips}>
          {profile.targetExamIds.map((id) => {
            const exam = exams.find((e) => e.id === id);
            return exam ? <Chip key={id} label={exam.name} tone="primary" icon="school-outline" onPress={() => router.push({ pathname: '/exam/[id]', params: { id } })} /> : null;
          })}
          <Chip label="Edit" icon="create-outline" onPress={() => router.push('/profile/edit-exams')} />
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Language</Text>
        <Card padded={false}>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(['en', 'hi'] as Language[]).map((lang) => {
              const selected = profile.language === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={() => changeLanguage(lang)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={lang === 'en' ? 'English' : 'Hindi'}
                  style={[styles.segmentItem, selected && styles.segmentSelected]}
                >
                  {selected ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
                  <Text variant="bodyStrong" tone={selected ? 'primary' : 'secondary'}>
                    {lang === 'en' ? 'English' : 'हिन्दी'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
        <Text variant="bodySmall" tone="secondary">
          Applies to questions, options and solutions where a Hindi version exists. The English section stays in English.
        </Text>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Purchases and invoices</Text>
        <Card padded={false}>
          {purchases.isError ? (
            <ListRow icon="cloud-offline-outline" title="Could not load purchases" subtitle="Tap to try again" onPress={() => void purchases.refetch()} />
          ) : !purchases.data ? (
            <ListRow icon="bag-outline" title="Loading purchases" />
          ) : purchases.data.length === 0 ? (
            <ListRow icon="bag-outline" title="No purchases yet" subtitle="Tests and series you buy appear here with their invoices." />
          ) : (
            purchases.data.map((p, i) => {
              const at = p.capturedAt ?? p.validUntil ?? '';
              return (
                <ListRow
                  key={p.id}
                  icon={p.itemType === 'test_series' ? 'albums-outline' : 'document-text-outline'}
                  iconTone={p.status === 'refunded' ? 'warning' : 'success'}
                  title={p.itemTitle}
                  subtitle={`${at ? `${formatDate(at)} · ` : ''}${p.status === 'refunded' ? 'Refunded' : (p.invoiceNumber ?? 'Invoice pending')}`}
                  divider={i > 0}
                  onPress={() => router.push({ pathname: '/purchase/[id]', params: { id: p.id } })}
                  accessibilityLabel={`${p.itemTitle}, ${formatPaise(p.totalPaise)}. Open receipt`}
                  trailing={
                    <View style={styles.amount}>
                      <Text variant="bodyStrong" tabular>
                        {formatPaise(p.totalPaise)}
                      </Text>
                      <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                  }
                />
              );
            })
          )}
        </Card>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Account</Text>
        <Card padded={false}>
          <ListRow icon="phone-portrait-outline" title="Devices" subtitle={activeDevices === undefined ? `Up to ${DEVICE_LIMIT} devices` : `${activeDevices} of ${DEVICE_LIMIT} devices in use`} onPress={() => router.push('/profile/devices')} />
          <ListRow icon="notifications-outline" title="Notifications" subtitle="Results, reminders, new tests" onPress={() => router.push('/profile/notifications')} divider />
          <ListRow icon="help-circle-outline" title="Help and support" subtitle="FAQs, contact us, grievances" onPress={() => router.push('/profile/help')} divider />
          <ListRow icon="document-outline" title="Terms and privacy" subtitle="Policies and your data choices" onPress={() => router.push('/profile/legal')} divider />
          <ListRow icon="download-outline" title="Download my data" subtitle="Your profile, attempts and purchases as a file" onPress={() => void shareMyData()} divider />
        </Card>
      </View>

      <View style={styles.danger}>
        <Button label="Sign out" variant="secondary" icon="log-out-outline" fullWidth onPress={() => void signOutEverywhere()} />
        <Button label="Delete account" variant="ghost" icon="trash-outline" fullWidth onPress={() => router.push('/profile/delete-account')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  block: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  segment: { flexDirection: 'row', padding: space.xs, gap: space.xs },
  segmentItem: { flex: 1, minHeight: touch.minSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: radius.md },
  segmentSelected: { backgroundColor: colors.primarySoft },
  amount: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  danger: { gap: space.md, marginTop: space.md },
});
