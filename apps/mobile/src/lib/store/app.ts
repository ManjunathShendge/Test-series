import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile as ServerProfile } from '@exam-prep/contracts';
import { applyPercentOff, examiners, pastResults, profile as demoProfile, purchases as demoPurchases, resolveCoupon, series, splitGst, tests } from '@/lib/demo';
import type { Language, NotificationPrefs, Profile, Purchase } from '@/lib/demo';
import { persistOptions } from './storage';

/**
 * Student session and entitlement state (docs/MOBILE.md: Zustand for UI
 * state), persisted on device so sign-in, purchases and follows survive a
 * restart. Sign-in, the profile basics and devices come from the API; the
 * catalogue, entitlements, follows and purchases are still demo data until
 * their milestones (B, C, E) replace them.
 */

export type PurchaseStatus = 'idle' | 'pending' | 'verifying' | 'confirmed' | 'failed';

export interface PurchaseRequest {
  kind: 'test' | 'series';
  id: string;
  couponCode?: string;
}

type Preferences = Partial<Pick<Profile, 'targetExamIds' | 'language' | 'preparationStage'>>;

interface AppState {
  session: { signedIn: boolean; onboarded: boolean };
  profile: Profile;
  ownedTestIds: string[];
  ownedSeriesIds: string[];
  followedExaminerIds: string[];
  attemptedTestIds: string[];
  purchases: Purchase[];
  purchaseStatus: PurchaseStatus;
  notificationPrefs: NotificationPrefs;
  /** Optional product analytics (docs/NOTIFICATIONS.md PostHog events); off until the student opts in. */
  analyticsConsent: boolean;
  /** Set while an account deletion request is in its grace period. */
  deletionRequestedAt: string | null;

  /** Applies the profile the API returned at sign-in or after an update. */
  applyServerProfile: (profile: ServerProfile) => void;
  completeOnboarding: (patch: Preferences) => void;
  /** Profile > Edit: the same fields as onboarding, editable any time (PRD 6.7). */
  updatePreferences: (patch: Preferences) => void;
  signOut: () => void;
  setLanguage: (language: Language) => void;

  toggleFollow: (examinerId: string) => void;
  markAttempted: (testId: string) => void;

  /** Simulates the store billing round trip: pending -> verifying -> confirmed. */
  purchase: (item: PurchaseRequest) => Promise<void>;
  resetPurchaseStatus: () => void;

  /** Web purchases only; access stays until the refund is verified (docs/PAYMENTS.md). */
  requestRefund: (purchaseId: string, reason: string, note?: string) => Promise<void>;
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;
  setAnalyticsConsent: (value: boolean) => void;
  requestDeletion: () => Promise<void>;
  cancelDeletion: () => void;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

const seed = () => ({
  session: { signedIn: false, onboarded: false },
  profile: demoProfile,
  ownedTestIds: [
    ...new Set([
      ...tests.filter((t) => t.availability === 'owned').map((t) => t.id),
      ...demoPurchases.filter((p) => p.kind === 'test').map((p) => p.itemId),
    ]),
  ],
  ownedSeriesIds: series.filter((s) => s.owned).map((s) => s.id),
  followedExaminerIds: examiners.filter((e) => e.isFollowed).map((e) => e.id),
  attemptedTestIds: pastResults.map((r) => r.testId),
  purchases: demoPurchases,
  purchaseStatus: 'idle' as const,
  notificationPrefs: { newTestsFromFollowed: true, unfinishedAttempt: true, examDateChanges: true } as NotificationPrefs,
  analyticsConsent: false,
  deletionRequestedAt: null as string | null,
});

type PersistedApp = Omit<ReturnType<typeof seed>, 'purchaseStatus'>;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...seed(),

      applyServerProfile: (p) =>
        set((s) => ({
          session: { signedIn: true, onboarded: p.onboarded },
          profile: {
            ...s.profile,
            name: p.fullName,
            email: p.email ?? '',
            language: p.preferredLanguage,
            preparationStage: p.preparationStage ?? s.profile.preparationStage,
          },
        })),
      completeOnboarding: (patch) =>
        set((s) => ({ session: { ...s.session, onboarded: true }, profile: { ...s.profile, ...patch } })),
      updatePreferences: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      // Sign-out resets to the demo seed so the next sign-in starts clean.
      // Results and any live attempt are cleared by signOutEverywhere().
      signOut: () => set(seed()),
      setLanguage: (language) => set((s) => ({ profile: { ...s.profile, language } })),

      toggleFollow: (examinerId) => set((s) => ({ followedExaminerIds: toggle(s.followedExaminerIds, examinerId) })),
      markAttempted: (testId) =>
        set((s) => (s.attemptedTestIds.includes(testId) ? s : { attemptedTestIds: [...s.attemptedTestIds, testId] })),

      purchase: async ({ kind, id, couponCode }) => {
        if (get().purchaseStatus === 'pending' || get().purchaseStatus === 'verifying') return;
        set({ purchaseStatus: 'pending' });
        await wait(900);
        set({ purchaseStatus: 'verifying' });
        await wait(700);

        const source = kind === 'test' ? tests.find((t) => t.id === id) : series.find((x) => x.id === id);
        if (!source) {
          set({ purchaseStatus: 'failed' });
          return;
        }
        // The server re-validates the code against the receipt; the client's
        // resolution is only a preview and is recomputed here the same way.
        const coupon = couponCode ? resolveCoupon(couponCode, { kind, id }) : null;
        const listPaise = source.pricePaise;
        const amountPaise = coupon?.ok ? applyPercentOff(listPaise, coupon.coupon.percentOff) : listPaise;
        const record: Purchase = {
          id: `pur-${Date.now()}`,
          title: source.title,
          kind,
          itemId: id,
          amountPaise,
          purchasedAt: new Date().toISOString(),
          channel: 'Google Play',
          invoiceNumber: `INV-2026-${String(4900 + get().purchases.length).padStart(6, '0')}`,
          gstPaise: splitGst(amountPaise).gstPaise,
          ...(coupon?.ok ? { couponCode: coupon.coupon.code, discountPaise: listPaise - amountPaise } : {}),
        };

        set((s) => ({
          purchaseStatus: 'confirmed',
          purchases: [record, ...s.purchases],
          ownedTestIds:
            kind === 'test'
              ? [...s.ownedTestIds, id]
              : [...s.ownedTestIds, ...(series.find((x) => x.id === id)?.testIds ?? [])],
          ownedSeriesIds: kind === 'series' ? [...s.ownedSeriesIds, id] : s.ownedSeriesIds,
        }));
      },
      resetPurchaseStatus: () => set({ purchaseStatus: 'idle' }),

      requestRefund: async (purchaseId, reason, note) => {
        await wait(800);
        set((s) => ({
          purchases: s.purchases.map((p) =>
            p.id === purchaseId && p.channel === 'Web' && !p.refund
              ? { ...p, refund: { status: 'requested', requestedAt: new Date().toISOString(), reason, ...(note ? { note } : {}) } }
              : p,
          ),
        }));
      },
      setNotificationPref: (key, value) => set((s) => ({ notificationPrefs: { ...s.notificationPrefs, [key]: value } })),
      setAnalyticsConsent: (value) => set({ analyticsConsent: value }),
      requestDeletion: async () => {
        await wait(900);
        set({ deletionRequestedAt: new Date().toISOString() });
      },
      cancelDeletion: () => set({ deletionRequestedAt: null }),
    }),
    persistOptions<AppState, PersistedApp>('app', (s) => ({
      session: s.session,
      profile: s.profile,
      ownedTestIds: s.ownedTestIds,
      ownedSeriesIds: s.ownedSeriesIds,
      followedExaminerIds: s.followedExaminerIds,
      attemptedTestIds: s.attemptedTestIds,
      purchases: s.purchases,
      notificationPrefs: s.notificationPrefs,
      analyticsConsent: s.analyticsConsent,
      deletionRequestedAt: s.deletionRequestedAt,
    })),
  ),
);

/** Effective access for a test: free, directly owned, or owned through its series. */
export function useHasAccess(testId: string): boolean {
  return useAppStore((s) => {
    const test = tests.find((t) => t.id === testId);
    if (!test) return false;
    if (test.pricePaise === 0) return true;
    if (s.ownedTestIds.includes(testId)) return true;
    return test.seriesId !== undefined && s.ownedSeriesIds.includes(test.seriesId);
  });
}
