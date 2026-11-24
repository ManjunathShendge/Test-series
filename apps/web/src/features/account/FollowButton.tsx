'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountApi } from '@/lib/api/identity';
import { ApiRequestError } from '@/lib/api/http';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { BusyButton } from '@/features/auth/ui';

type Props = { examinerId: string; examinerName: string; path: string };

/**
 * Follow / unfollow an examiner (PRD 6.2). Signed-out visitors get a sign-in link that brings
 * them back here. New tests from followed examiners appear on the account page.
 */
// Public catalogue pages have no session provider of their own (same pattern as CheckoutPanel).
export function FollowButton(props: Props) {
  return (
    <AuthProvider>
      <Follow {...props} />
    </AuthProvider>
  );
}

function Follow({ examinerId, examinerName, path }: Props) {
  const { state } = useAuth();
  const ready = state.status === 'ready';
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    accountApi
      .following()
      .then((f) => live && setFollowed(f.examiners.some((e) => e.id === examinerId)))
      .catch(() => live && setFollowed(false));
    return () => {
      live = false;
    };
  }, [ready, examinerId]);

  if (!ready) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className="btn btn-primary">
        Follow {examinerName}
      </Link>
    );
  }

  const toggle = async () => {
    if (followed === null) return;
    setBusy(true);
    setError(null);
    try {
      await (followed ? accountApi.unfollow(examinerId) : accountApi.follow(examinerId));
      setFollowed(!followed);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not update. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BusyButton
        busy={busy || followed === null}
        className={followed ? 'btn btn-secondary' : 'btn btn-primary'}
        aria-pressed={followed ?? false}
        aria-label={followed ? `Unfollow ${examinerName}` : `Follow ${examinerName}`}
        onClick={() => void toggle()}
        type="button"
      >
        {followed ? 'Following' : 'Follow'}
      </BusyButton>
      {error ? (
        <p role="alert" className="t-small" style={{ color: 'var(--error)', marginTop: 6 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
