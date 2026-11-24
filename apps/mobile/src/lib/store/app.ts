import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PreparationStage, Profile as ServerProfile } from '@exam-prep/contracts';
import type { Language } from '@/lib/catalogue/types';
import { persistOptions } from './storage';

/**
 * Device-side session and UI preferences (docs/MOBILE.md: Zustand for UI state). The profile
 * here mirrors the last answer from the API; follows, entitlements, attempts, purchases and
 * notification preferences are server data read through TanStack Query, never stored or
 * decided on the phone.
 */

export interface StudentProfile {
  name: string;
  email: string;
  targetExamIds: string[];
  language: Language;
  preparationStage: PreparationStage | null;
  /** Set while an account deletion request is in its grace period. */
  deletionRequestedAt: string | null;
}

interface AppState {
  session: { signedIn: boolean; onboarded: boolean };
  /** First-launch introduction finished on this device; survives sign-out. */
  introSeen: boolean;
  profile: StudentProfile;
  /** Optional product analytics (docs/NOTIFICATIONS.md PostHog events); off until the student opts in. */
  analyticsConsent: boolean;

  /** Applies the profile the API returned at sign-in or after an update. */
  applyServerProfile: (profile: ServerProfile) => void;
  signOut: () => void;
  markIntroSeen: () => void;
  setAnalyticsConsent: (value: boolean) => void;
}

const seed = () => ({
  session: { signedIn: false, onboarded: false },
  introSeen: false,
  profile: { name: '', email: '', targetExamIds: [], language: 'en', preparationStage: null, deletionRequestedAt: null } as StudentProfile,
  analyticsConsent: false,
});

type PersistedApp = ReturnType<typeof seed>;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...seed(),

      applyServerProfile: (p) =>
        set({
          session: { signedIn: true, onboarded: p.onboarded },
          profile: {
            name: p.fullName,
            email: p.email ?? '',
            targetExamIds: p.targetExamIds,
            language: p.preferredLanguage,
            preparationStage: p.preparationStage,
            deletionRequestedAt: p.deletionRequestedAt ?? null,
          },
        }),
      // Results, attempts and cached server data are cleared by signOutEverywhere().
      signOut: () => set((s) => ({ ...seed(), introSeen: s.introSeen })),
      markIntroSeen: () => set({ introSeen: true }),
      setAnalyticsConsent: (value) => set({ analyticsConsent: value }),
    }),
    // A new key: state saved by the earlier demo build is not read back.
    persistOptions<AppState, PersistedApp>('student', (s) => ({
      session: s.session,
      introSeen: s.introSeen,
      profile: s.profile,
      analyticsConsent: s.analyticsConsent,
    })),
  ),
);
