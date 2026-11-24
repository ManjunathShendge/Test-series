'use client';

import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';

/** Last-resort boundary for pages outside a more specific one. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main">
      <ErrorScreen kind={errorKind(error)} variant="page" onRetry={reset} />
    </main>
  );
}
