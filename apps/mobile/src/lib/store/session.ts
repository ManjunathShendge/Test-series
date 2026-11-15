import { useAppStore } from './app';
import { useAttemptStore } from './attempt';
import { useResultsStore } from './results';

/**
 * Signs the student out of this device: session, entitlements, results and any
 * live attempt all return to the demo seed, so the next sign-in never sees the
 * previous student's data. Each store persists the reset state.
 */
export function signOutEverywhere(): void {
  useAttemptStore.getState().reset();
  useResultsStore.getState().reset();
  useAppStore.getState().signOut();
}
