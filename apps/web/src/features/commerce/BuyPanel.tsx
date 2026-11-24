'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PurchaseItemType } from '@exam-prep/contracts';
import { AUTH_HINT_EVENT, getSignedInHint } from '@/lib/storage/device';
import { Glyph } from '@/features/marketing/showcase/Glyph';

export interface BuyItem {
  itemType: PurchaseItemType;
  itemId: string;
  path: string;
  title: string;
}

// Firebase and the checkout code load only for signed-in visitors, so catalogue pages stay light.
const Checkout = dynamic(() => import('./CheckoutPanel').then((m) => m.CheckoutPanel), {
  ssr: false,
  loading: () => (
    <button type="button" className="btn btn-primary btn-lg btn-full" disabled aria-busy="true">
      Checking your access…
    </button>
  ),
});

/** The buy button on a paid test or series: sign in first, then Razorpay checkout. */
export function BuyPanel({ item }: { item: BuyItem }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setSignedIn(getSignedInHint());
    sync();
    window.addEventListener(AUTH_HINT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_HINT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (signedIn) return <Checkout item={item} />;
  return (
    <Link href={`/sign-in?next=${encodeURIComponent(item.path)}`} className="btn btn-primary btn-lg btn-full">
      Sign in to buy <Glyph name="arrow" size={18} />
    </Link>
  );
}
