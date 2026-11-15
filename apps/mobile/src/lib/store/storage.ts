import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware';

/**
 * On-device persistence for the student stores (PRD 6.4 "answers save on the
 * device first"; docs/MOBILE.md). JSON in AsyncStorage is enough for the demo
 * data volume; the production client moves the attempt event log to SQLite so
 * a save is durable before the UI acknowledges it (invariant 8).
 */
const storage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

export const jsonStorage = createJSONStorage(() => storage);

/** Shared options so every store versions and names its key the same way. */
export function persistOptions<S, P>(name: string, partialize: (state: S) => P): PersistOptions<S, P> {
  return {
    name: `examprep.${name}.v1`,
    version: 1,
    storage: jsonStorage as PersistOptions<S, P>['storage'],
    partialize,
  };
}

interface Hydratable {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}

/** True once every given store has rehydrated from disk. */
export function useHydrated(stores: Hydratable[]): boolean {
  const [hydrated, setHydrated] = useState(() => stores.every((s) => s.persist.hasHydrated()));
  useEffect(() => {
    if (hydrated) return;
    const check = () => {
      if (stores.every((s) => s.persist.hasHydrated())) setHydrated(true);
    };
    const unsubs = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
    // Stores are module singletons; the list never changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  return hydrated;
}

/** Clears every persisted key. Used by sign-out so the next student starts clean. */
export async function clearPersistedState(names: string[]): Promise<void> {
  await AsyncStorage.multiRemove(names.map((n) => `examprep.${n}.v1`));
}
