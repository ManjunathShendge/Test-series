'use client';

import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';

/** The catalogue API failed or answered unexpectedly. Offer a retry, never a blank page. */
export default function CatalogueError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const kind = errorKind(error);
  return (
    <ErrorScreen
      kind={kind}
      variant="page"
      onRetry={reset}
      title={kind === 'offline' ? undefined : 'We couldn’t load the tests right now'}
    >
      {kind === 'offline' ? undefined : <p>This is usually a brief connection issue on our side. Your progress and purchases are not affected.</p>}
    </ErrorScreen>
  );
}
