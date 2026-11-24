'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import type { CheckoutOrder, OrderQuote } from '@exam-prep/contracts';
import { checkoutApi, inr } from '@/lib/api/commerce';
import { ApiRequestError } from '@/lib/api/http';
import { site } from '@/lib/config/site';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { Alert, BusyButton, Notice } from '@/features/auth/ui';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import type { BuyItem } from './BuyPanel';
import styles from './commerce.module.css';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let checkoutScript: Promise<RazorpayConstructor> | null = null;

/** Loads Razorpay Checkout once per page; a failed load can be retried. */
function loadCheckout(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  checkoutScript ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error('missing'));
    };
    script.onerror = () => reject(new Error('blocked'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    checkoutScript = null;
    throw error;
  });
  return checkoutScript;
}

const message = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.';

export function CheckoutPanel({ item }: { item: BuyItem }) {
  return (
    <AuthProvider>
      <Checkout item={item} />
    </AuthProvider>
  );
}

type Phase = 'idle' | 'ordering' | 'paying' | 'verifying' | 'done';

function Checkout({ item }: { item: BuyItem }) {
  const { state } = useAuth();
  const couponId = useId();
  const [owned, setOwned] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const ready = state.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    let live = true;
    checkoutApi
      .ownership(item.itemType, item.itemId)
      .then((o) => {
        if (!live) return;
        setOwned(o.owned);
        setEnabled(o.paymentsEnabled);
      })
      .catch((e: unknown) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [ready, item.itemType, item.itemId]);

  const applyCode = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    setCouponError(null);
    if (!/^[A-Z0-9]{4,20}$/.test(trimmed)) return setCouponError('Codes are 4 to 20 letters or digits.');
    setQuoting(true);
    try {
      setQuote(await checkoutApi.quote({ itemType: item.itemType, itemId: item.itemId, couponCode: trimmed }));
    } catch (e) {
      setQuote(null);
      setCouponError(message(e));
    } finally {
      setQuoting(false);
    }
  }, [code, item.itemType, item.itemId]);

  async function pay() {
    setError(null);
    setPhase('ordering');
    let order: CheckoutOrder;
    let Razorpay: RazorpayConstructor;
    try {
      [order, Razorpay] = await Promise.all([
        checkoutApi.order({ itemType: item.itemType, itemId: item.itemId, ...(quote?.couponCode ? { couponCode: quote.couponCode } : {}) }),
        loadCheckout(),
      ]);
    } catch (e) {
      setPhase('idle');
      if (e instanceof ApiRequestError && e.code === 'ALREADY_OWNED') return setOwned(true);
      return setError(e instanceof ApiRequestError ? e.message : 'The payment window could not load. Check your connection or ad blocker and try again.');
    }
    setPhase('paying');
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: site.name,
      description: order.itemName,
      prefill: { name: order.prefill.name, ...(order.prefill.email ? { email: order.prefill.email } : {}) },
      notes: { purchase_id: order.purchaseId },
      theme: { color: '#0a4174' },
      modal: { ondismiss: () => setPhase((p) => (p === 'paying' ? 'idle' : p)) },
      handler: (response: RazorpayResponse) => void verify(order.purchaseId, response),
    });
    checkout.on('payment.failed', (response) => {
      setError(`${response.error?.description ?? 'The payment did not go through.'} You can try again; you have not been charged for a failed payment.`);
    });
    checkout.open();
  }

  async function verify(purchaseId: string, response: RazorpayResponse) {
    setPhase('verifying');
    // The payment is confirmed on the server; a dropped connection is retried, never assumed.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await checkoutApi.verify(purchaseId, {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        if (result.status === 'captured') {
          setOwned(true);
          setPhase('done');
          return;
        }
        break;
      } catch (e) {
        const retry = e instanceof ApiRequestError && (e.code === 'NETWORK' || e.status >= 500);
        if (!retry || attempt === 2) {
          setPhase('idle');
          setError(
            retry
              ? 'Your payment went through but we could not confirm it yet. Access appears in your account within a few minutes; do not pay again.'
              : message(e),
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    setPhase('idle');
    setError('The payment was not completed. You have not been charged.');
  }

  if (state.status !== 'ready') {
    if (state.status === 'loading' || state.status === 'offline')
      return <BusyButton busy type="button">Checking your access…</BusyButton>;
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(item.path)}`} className="btn btn-primary btn-lg btn-full">
        Sign in to buy <Glyph name="arrow" size={18} />
      </Link>
    );
  }
  if (owned === null && !error) return <BusyButton busy type="button">Checking your access…</BusyButton>;
  if (owned)
    return (
      <div className={styles.owned}>
        {phase === 'done' ? <Notice>Payment received. {item.title} is now yours.</Notice> : null}
        <p className={styles.ownedLine}>
          <Glyph name="check" size={18} /> {item.itemType === 'test_series' ? 'You own this series' : 'You have access to this test'}
        </p>
        {item.itemType === 'single_test' ? (
          <Link href={item.path.replace(/^\/tests\//, '/attempt/start/')} className="btn btn-primary btn-lg btn-full">
            Start test <Glyph name="arrow" size={18} />
          </Link>
        ) : null}
        <Link href="/account" className="btn btn-secondary btn-lg btn-full">
          View your purchases
        </Link>
      </div>
    );
  if (!enabled)
    return (
      <p className={styles.unavailable} role="status">
        Online payments are not switched on yet. Please check back soon.
      </p>
    );

  return (
    <div className={styles.buy}>
      <form
        className={styles.coupon}
        onSubmit={(event) => {
          event.preventDefault();
          void applyCode();
        }}
      >
        <label htmlFor={couponId}>Have a code?</label>
        <div className={styles.couponRow}>
          <input
            id={couponId}
            className={styles.input}
            value={code}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={couponError ? true : undefined}
            aria-describedby={couponError ? `${couponId}-error` : undefined}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setQuote(null);
              setCouponError(null);
            }}
          />
          <BusyButton busy={quoting} className="btn btn-secondary" type="submit" disabled={!code.trim() || phase !== 'idle'}>
            Apply
          </BusyButton>
        </div>
        {couponError ? (
          <p id={`${couponId}-error`} className={styles.couponError} role="alert">
            {couponError}
          </p>
        ) : null}
        {quote && quote.discountPaise > 0 ? (
          <p className={styles.saving} role="status">
            {quote.couponCode} applied: you save {inr(quote.discountPaise)}. You pay <strong>{inr(quote.totalPaise)}</strong>.
          </p>
        ) : null}
      </form>
      <BusyButton busy={phase !== 'idle'} type="button" onClick={() => void pay()}>
        {phase === 'verifying'
          ? 'Confirming payment…'
          : phase === 'paying'
            ? 'Complete payment in the window'
            : quote
              ? `Pay ${inr(quote.totalPaise)}`
              : 'Buy now'}
        {phase === 'idle' ? <Glyph name="arrow" size={18} /> : null}
      </BusyButton>
      <p className={styles.fine}>Secure payment by Razorpay: UPI, cards, net banking and wallets. Price includes GST.</p>
      <div aria-live="polite">{error ? <Alert>{error}</Alert> : null}</div>
    </div>
  );
}
