'use client';

import type { PlaceOrderResponse } from '@ems/contracts';
import { CheckCircle2, Mail, Package } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Spinner } from '@/components/ui';
import { readStoredOrder } from '@/lib/confirmation';
import { formatMoney } from '@/lib/money';

/**
 * The receipt.
 *
 * Read from `sessionStorage` in an effect rather than during render: the server
 * has no access to it, so reading it in the render body would produce HTML that
 * disagrees with the client's and get thrown away as a hydration mismatch.
 *
 * `null` after loading is a real, expected state — a hard refresh, a bookmarked
 * URL, a shopper arriving from history — and it gets an honest message rather
 * than a receipt full of blanks. The order was still placed; there is simply no
 * endpoint to read it back from without an authenticated customer.
 */
export function ConfirmationView() {
  const [order, setOrder] = useState<PlaceOrderResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOrder(readStoredOrder());
    setLoaded(true);
    // Deliberately not cleared here. Clearing on mount would blank the page on a
    // React strict-mode double-render in development, and a receipt that survives
    // an accidental refresh within the same tab is the friendlier behaviour.
  }, []);

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading your order" />
      </div>
    );
  }

  if (!order) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <Mail className="mx-auto h-10 w-10 text-ink-muted" aria-hidden />
        <h1 className="font-heading text-xl font-semibold text-ink">Thanks for your order</h1>
        <p className="text-sm text-ink-muted">
          We do not have the order details to hand any more — this page only holds them for the tab you
          ordered in. If you gave us an email address, your confirmation is on its way there.
        </p>
        <ContinueLink />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-brand" aria-hidden />
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">Order confirmed</h1>
        <p className="text-sm text-ink-muted">
          Thanks — your order is in. Keep the order number below for your records.
        </p>
      </div>

      <Card className="divide-y divide-line">
        <Row label="Order number" value={order.orderNumber} mono />
        <Row label="Total" value={formatMoney(order.total)} />
        <Row label="Payment" value={describePaymentStatus(order.paymentStatus)} />
      </Card>

      {/* Only meaningful for a gateway that hands back a client-side step. Cash on
          delivery returns `payment: null`, so this stays out of the way. */}
      {order.payment && (
        <Card className="space-y-1 p-4">
          <p className="text-sm font-medium text-ink">Payment pending</p>
          <p className="text-sm text-ink-muted">
            This order was placed through {order.payment.gateway}, which still needs to confirm the payment.
            The shop will update you once it settles.
          </p>
        </Card>
      )}

      <div className="flex flex-col items-center gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Package className="h-4 w-4" aria-hidden />
          You will get a note when it ships.
        </p>
        <ContinueLink />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={mono ? 'font-mono text-sm font-semibold text-ink' : 'text-sm font-semibold text-ink'}>
        {value}
      </span>
    </div>
  );
}

function ContinueLink() {
  return (
    <Link
      href="/products"
      className="inline-flex h-10 items-center rounded-theme border border-line px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand"
    >
      Continue shopping
    </Link>
  );
}

/** The API's payment status is an internal enum; this is the shopper-facing wording. */
function describePaymentStatus(status: string): string {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'Due on delivery';
    case 'AUTHORIZED':
      return 'Authorised';
    case 'PAID':
    case 'CAPTURED':
      return 'Paid';
    case 'FAILED':
      return 'Payment failed';
    default:
      return status;
  }
}
