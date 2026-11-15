import { create } from 'zustand';
import { examiners, pastResults, profile as demoProfile, purchases as demoPurchases, series, tests } from '@/lib/demo';
import type { Language, Profile, Purchase } from '@/lib/demo';

/**
 * Transient app state (docs/MOBILE.md: Zustand for UI state). Seeded from the
 * demo dataset. Entitlement, follows and purchases are server-decided in the
 * real product; here they are mocked so the demo flows end to end.
 */

export type PurchaseStatus = 'idle' | 'pending' | 'verifying' | 'confirmed' | 'failed';

interface AppState {
  session: { signedIn: boolean; onboarded: boolean };
  profile: Profile;
  ownedTestIds: string[];
  ownedSeriesIds: string[];
  followedExaminerIds: string[];
  bookmarkedQuestionIds: string[];
  attemptedTestIds: string[];
  purchases: Purchase[];
  purchaseStatus: PurchaseStatus;

  signIn: () => void;
  completeOnboarding: (patch: Partial<Pick<Profile, 'targetExamIds' | 'language' | 'preparationStage'>>) => void;
  signOut: () => void;
  setLanguage: (language: Language) => void;

  toggleFollow: (examinerId: string) => void;
  toggleBookmark: (questionId: string) => void;
  markAttempted: (testId: string) => void;

  /** Simulates the store billing round trip: pending -> verifying -> confirmed. */
  purchase: (item: { kind: 'test' | 'series'; id: string }) => Promise<void>;
  resetPurchaseStatus: () => void;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const useAppStore = create<AppState>((set, get) => ({
  session: { signedIn: false, onboarded: false },
  profile: demoProfile,
  ownedTestIds: tests.filter((t) => t.availability === 'owned').map((t) => t.id),
  ownedSeriesIds: series.filter((s) => s.owned).map((s) => s.id),
  followedExaminerIds: examiners.filter((e) => e.isFollowed).map((e) => e.id),
  bookmarkedQuestionIds: ['q7', 'g10'],
  attemptedTestIds: pastResults.map((r) => r.testId),
  purchases: demoPurchases,
  purchaseStatus: 'idle',

  signIn: () => set((s) => ({ session: { ...s.session, signedIn: true } })),
  completeOnboarding: (patch) =>
    set((s) => ({ session: { ...s.session, onboarded: true }, profile: { ...s.profile, ...patch } })),
  signOut: () => set({ session: { signedIn: false, onboarded: false } }),
  setLanguage: (language) => set((s) => ({ profile: { ...s.profile, language } })),

  toggleFollow: (examinerId) => set((s) => ({ followedExaminerIds: toggle(s.followedExaminerIds, examinerId) })),
  toggleBookmark: (questionId) => set((s) => ({ bookmarkedQuestionIds: toggle(s.bookmarkedQuestionIds, questionId) })),
  markAttempted: (testId) =>
    set((s) => (s.attemptedTestIds.includes(testId) ? s : { attemptedTestIds: [...s.attemptedTestIds, testId] })),

  purchase: async ({ kind, id }) => {
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
    const record: Purchase = {
      id: `pur-${Date.now()}`,
      title: source.title,
      kind,
      amountPaise: source.pricePaise,
      purchasedAt: new Date().toISOString(),
      channel: 'Google Play',
      invoiceNumber: `INV-2026-${String(4900 + get().purchases.length).padStart(6, '0')}`,
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
}));

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
