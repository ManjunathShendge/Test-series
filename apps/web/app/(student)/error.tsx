'use client';

import { ErrorScreen } from '@/ui/errors/ErrorScreen';

/** Anything unexpected on a test screen. Answers already saved on the device stay there. */
export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main">
      <ErrorScreen kind="server" variant="page" onRetry={reset}>
        <p>Something went wrong on this screen. Answers you already gave are saved; try again to carry on.</p>
      </ErrorScreen>
    </main>
  );
}
