import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

// firebase/auth ships getReactNativePersistence only in its react-native build, and its
// package exports list the browser types first, so TypeScript never sees it. Metro
// resolves the react-native build at run time.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
