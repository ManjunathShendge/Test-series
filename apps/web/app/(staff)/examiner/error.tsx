'use client';

import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';

/** Keeps the console menu around an unexpected page failure. */
export default function AreaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind={errorKind(error)} variant="page" as="h1" onRetry={reset} />;
}
