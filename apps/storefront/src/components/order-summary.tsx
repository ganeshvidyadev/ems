import type { MoneyDto } from '@ems/contracts';
import { cn } from '@/lib/utils';
import { formatMoney, isNonZero } from '@/lib/money';

/**
 * The subtotal → total breakdown, shared by the cart and the checkout panel so
 * the two can never disagree about how a total is presented.
 *
 * Every figure is passed in from the API's own calculation. Nothing here adds
 * anything up: the server owns pricing, and a client that re-derives a total will
 * eventually show a shopper a number the order does not charge.
 */
export interface SummaryFigures {
  subtotal: MoneyDto;
  discount: MoneyDto;
  shipping: MoneyDto;
  tax: MoneyDto;
  /** Present only once a payment method that carries a fee (COD) has been quoted (BUG-FE-011). */
  codFee?: MoneyDto;
  total: MoneyDto;
}

export function OrderSummary({
  figures,
  couponCode,
  /** Dims the figures while a fresh quote is in flight, without collapsing the layout. */
  pending = false,
  className,
}: {
  figures: SummaryFigures;
  couponCode?: string | null;
  pending?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn('space-y-2.5 text-sm transition-opacity', pending && 'opacity-50', className)}>
      <Row label="Subtotal" value={formatMoney(figures.subtotal)} />

      {/* Zero rows are hidden rather than shown as "₹0.00": a discount line that
          reads zero invites a shopper to wonder what went wrong with their coupon. */}
      {isNonZero(figures.discount) && (
        <Row
          label={couponCode ? `Discount (${couponCode})` : 'Discount'}
          value={`− ${formatMoney(figures.discount)}`}
          tone="sale"
        />
      )}

      <Row
        label="Shipping"
        value={isNonZero(figures.shipping) ? formatMoney(figures.shipping) : 'Free'}
      />

      {isNonZero(figures.tax) && <Row label="Tax" value={formatMoney(figures.tax)} />}

      {figures.codFee && isNonZero(figures.codFee) && (
        <Row label="Cash-on-delivery fee" value={formatMoney(figures.codFee)} />
      )}

      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <dt className="font-heading text-base font-semibold text-ink">Total</dt>
        <dd className="font-heading text-lg font-semibold text-ink">{formatMoney(figures.total)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'sale' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('tabular-nums', tone === 'sale' ? 'text-sale' : 'text-ink')}>{value}</dd>
    </div>
  );
}
