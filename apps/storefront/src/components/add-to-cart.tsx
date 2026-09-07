'use client';

import type { ProductResponse, VariantResponse } from '@ems/contracts';
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { useAddToCart } from '@/lib/use-cart';
import { cn } from '@/lib/utils';

/**
 * Variant picker, quantity stepper and add-to-cart.
 *
 * The only interactive part of the product page, so it is the only part shipped
 * as a client component — the description, price and reviews list around it stay
 * server-rendered.
 */
export function AddToCart({ product }: { product: ProductResponse }) {
  const { storeId } = useStore();
  const addToCart = useAddToCart();

  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const [variantId, setVariantId] = useState<string | undefined>(() => variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? null;

  // The confirmation is transient: it acknowledges the click and then gets out of
  // the way so the button reads "Add to cart" again for a second add.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(timer);
  }, [added]);

  // A store that did not resolve has no id to add against. Saying so is more use
  // than a button that fails with a 409 the shopper cannot interpret.
  if (!storeId) {
    return (
      <Alert tone="info">
        This shop is not open for orders yet, so items cannot be added to a cart.
      </Alert>
    );
  }

  const price = selectedVariant?.priceMinor ?? product.priceMinor;

  async function onAdd() {
    setAdded(false);
    try {
      await addToCart.mutateAsync({ productId: product.id, variantId, quantity });
      setAdded(true);
    } catch {
      // Rendered from the mutation's own error state below; swallowed here so an
      // unhandled rejection does not reach the console.
    }
  }

  return (
    <div className="space-y-4">
      {variants.length > 1 && (
        <VariantPicker
          variants={variants}
          selectedId={variantId}
          currency={product.currency}
          onSelect={(id) => {
            setVariantId(id);
            setAdded(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} />

        <Button size="lg" onClick={onAdd} loading={addToCart.isPending} className="flex-1 sm:flex-none">
          {added ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
          {added ? 'Added to cart' : `Add to cart · ${formatMinor(price, product.currency)}`}
        </Button>
      </div>

      {added && (
        <p className="text-sm text-ink-muted" role="status">
          Added.{' '}
          <Link href="/cart" className="font-medium text-brand hover:underline">
            View cart
          </Link>
        </p>
      )}

      {addToCart.isError && (
        <Alert>
          {addToCart.error instanceof ApiError
            ? addToCart.error.message
            : 'We could not add that to your cart. Please try again.'}
        </Alert>
      )}
    </div>
  );
}

function VariantPicker({
  variants,
  selectedId,
  currency,
  onSelect,
}: {
  variants: VariantResponse[];
  selectedId: string | undefined;
  currency: string;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">Options</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const isSelected = variant.id === selectedId;

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelect(variant.id)}
              aria-pressed={isSelected}
              className={cn(
                'rounded-theme border px-3 py-2 text-left text-sm transition',
                isSelected
                  ? 'border-brand bg-surface-alt text-ink'
                  : 'border-line text-ink-muted hover:border-brand hover:text-ink',
              )}
            >
              <span className="block font-medium text-ink">{variant.title ?? variant.sku}</span>
              <span className="block text-xs text-ink-muted">{formatMinor(variant.priceMinor, currency)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 1–999, matching the API's own bounds so the UI cannot compose a request it will reject. */
function QuantityStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="inline-flex h-12 items-center rounded-theme border border-line">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Decrease quantity"
        className="grid h-full w-10 place-items-center text-ink-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>

      <input
        type="number"
        min={1}
        max={999}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          // An empty or non-numeric box would otherwise send NaN; clamping to 1
          // keeps the field always in a state the API accepts.
          onChange(Number.isFinite(parsed) ? Math.min(999, Math.max(1, Math.trunc(parsed))) : 1);
        }}
        aria-label="Quantity"
        className="h-full w-12 border-x border-line bg-surface text-center text-sm text-ink [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(Math.min(999, value + 1))}
        disabled={value >= 999}
        aria-label="Increase quantity"
        className="grid h-full w-10 place-items-center text-ink-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
