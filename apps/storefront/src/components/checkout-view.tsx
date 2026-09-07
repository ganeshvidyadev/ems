'use client';

import type { CheckoutPricingResponse, PlaceOrderResponse } from '@ems/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Banknote, Lock, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { OrderSummary } from '@/components/order-summary';
import { ProductThumb } from '@/components/product-thumb';
import { Alert, Button, Card, EmptyState, Field, Input, Spinner, Textarea } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import {
  CHECKOUT_FORM_DEFAULTS,
  checkoutFormSchema,
  isAddressPriceable,
  toOrderAddress,
  type CheckoutFormValues,
} from '@/lib/checkout-schema';
import { CONFIRMATION_STORAGE_KEY } from '@/lib/confirmation';
import { formatMinor } from '@/lib/money';
import { useCart, useClearCartId } from '@/lib/use-cart';

/**
 * Guest checkout: address, contact, payment, place order.
 *
 * Guest-only because that is what the API supports — `placeOrderRequestSchema`
 * has no `customerId` field at all, and there is no storefront customer auth to
 * derive one from. So there is no sign-in step to build, and pretending otherwise
 * would mean a login form with nothing behind it.
 */
export function CheckoutView() {
  const router = useRouter();
  const { cart, isLoading } = useCart();
  const clearCartId = useClearCartId();

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: CHECKOUT_FORM_DEFAULTS,
    // Validate as fields are left rather than on every keystroke: an email is
    // "invalid" for most of the time it takes to type one.
    mode: 'onBlur',
  });

  /**
   * One key per checkout attempt, generated once and held for the life of this
   * component.
   *
   * That is exactly the semantics the header needs: a network retry of the *same*
   * submit must be deduplicated by the server, while a shopper who lands back here
   * to order again must get a genuinely new order. A key generated per request
   * would deduplicate nothing; a key stored globally would refuse the second order.
   */
  const idempotencyKey = useRef<string>('');
  if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey();

  const values = useWatch({ control: form.control });
  const pricing = useLivePricing(cart?.id ?? null, values as CheckoutFormValues);

  const placeOrder = useMutation<PlaceOrderResponse, Error, CheckoutFormValues>({
    mutationFn: (formValues) =>
      api.request<PlaceOrderResponse>('/checkout/orders', {
        method: 'POST',
        idempotencyKey: idempotencyKey.current,
        body: {
          cartId: cart!.id,
          email: formValues.email.trim() || undefined,
          phone: formValues.phone.trim() || undefined,
          shippingAddress: toOrderAddress(formValues),
          // No separate billing address is collected: the API treats it as
          // optional and defaults to the shipping address, and a second identical
          // form is friction with no payload behind it.
          shippingMethod: 'STANDARD',
          paymentGateway: formValues.paymentGateway,
          customerNote: formValues.customerNote.trim() || undefined,
        },
      }),
    onSuccess: (order) => {
      // There is no public endpoint to re-fetch an order after placement, so the
      // response is handed to the confirmation page through `sessionStorage`. It
      // has to be written *before* navigating, or the next page has nothing to read.
      try {
        window.sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(order));
      } catch {
        // Storage blocked: the confirmation page falls back to its generic
        // "check your email" message. The order itself is already placed.
      }

      // The cart was consumed server-side, so the stored id is spent.
      clearCartId();
      router.push('/checkout/confirmation');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-muted">
        <Spinner label="Loading checkout" />
        Loading checkout…
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="There is nothing to check out"
        description="Your cart is empty, so there is no order to place yet."
        action={
          <Link
            href="/products"
            className="inline-flex h-10 items-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Browse products
          </Link>
        }
      />
    );
  }

  // The cart's own estimates until a priceable address exists; the live quote
  // replaces them the moment the API can compute shipping and tax for real.
  const figures = pricing.data ?? {
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping: cart.shippingEstimate,
    tax: cart.taxEstimate,
    total: cart.total,
  };

  return (
    <form
      onSubmit={form.handleSubmit((formValues) => placeOrder.mutate(formValues))}
      className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start"
      noValidate
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">Contact</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Optional, but this is the only way we can send you an order confirmation and let you know when
              it ships.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(form.formState.errors.email) || undefined}
                {...form.register('email')}
              />
            </Field>

            <Field
              label="Phone"
              htmlFor="phone"
              hint="For delivery updates."
              error={form.formState.errors.phone?.message}
            >
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+919876543210"
                aria-invalid={Boolean(form.formState.errors.phone) || undefined}
                {...form.register('phone')}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-line pt-8">
          <h2 className="font-heading text-lg font-semibold text-ink">Delivery address</h2>

          <Field
            label="Full name"
            htmlFor="recipientName"
            required
            error={form.formState.errors.recipientName?.message}
          >
            <Input
              id="recipientName"
              autoComplete="name"
              aria-invalid={Boolean(form.formState.errors.recipientName) || undefined}
              {...form.register('recipientName')}
            />
          </Field>

          <Field
            label="Address"
            htmlFor="addressLine1"
            required
            error={form.formState.errors.addressLine1?.message}
          >
            <Input
              id="addressLine1"
              autoComplete="address-line1"
              placeholder="House or flat number and street"
              aria-invalid={Boolean(form.formState.errors.addressLine1) || undefined}
              {...form.register('addressLine1')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Apartment, floor (optional)" htmlFor="addressLine2">
              <Input id="addressLine2" autoComplete="address-line2" {...form.register('addressLine2')} />
            </Field>

            <Field label="Landmark (optional)" htmlFor="landmark">
              <Input id="landmark" placeholder="Near the metro station" {...form.register('landmark')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city" required error={form.formState.errors.city?.message}>
              <Input
                id="city"
                autoComplete="address-level2"
                aria-invalid={Boolean(form.formState.errors.city) || undefined}
                {...form.register('city')}
              />
            </Field>

            <Field
              label="Postal code"
              htmlFor="postalCode"
              required
              error={form.formState.errors.postalCode?.message}
            >
              <Input
                id="postalCode"
                autoComplete="postal-code"
                inputMode="numeric"
                aria-invalid={Boolean(form.formState.errors.postalCode) || undefined}
                {...form.register('postalCode')}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="State (optional)" htmlFor="stateName">
              <Input id="stateName" autoComplete="address-level1" {...form.register('stateName')} />
            </Field>

            <Field label="State code (optional)" htmlFor="stateCode" hint="e.g. KA">
              <Input id="stateCode" maxLength={10} {...form.register('stateCode')} />
            </Field>

            <Field
              label="Country"
              htmlFor="countryCode"
              required
              hint="Two-letter code"
              error={form.formState.errors.countryCode?.message}
            >
              <Input
                id="countryCode"
                maxLength={2}
                autoComplete="country"
                className="uppercase"
                aria-invalid={Boolean(form.formState.errors.countryCode) || undefined}
                {...form.register('countryCode')}
              />
            </Field>
          </div>

          <Field label="Delivery notes (optional)" htmlFor="customerNote">
            <Textarea
              id="customerNote"
              rows={2}
              placeholder="Anything the courier should know"
              {...form.register('customerNote')}
            />
          </Field>
        </section>

        <section className="space-y-4 border-t border-line pt-8">
          <h2 className="font-heading text-lg font-semibold text-ink">Payment</h2>

          {/*
            Cash on delivery is the only method offered because it is the only one
            that completes an order end-to-end in this environment. The gateway
            factory reports `stub` as the sole configured adapter, and a stub
            payment leaves the order awaiting a webhook callback the shopper has no
            way to trigger — so offering it would be a dead end, and offering
            razorpay/stripe would be a method with no credentials behind it.
          */}
          <label className="flex cursor-pointer items-start gap-3 rounded-theme border border-brand bg-surface-alt p-4">
            <input
              type="radio"
              value="cod"
              className="mt-1 accent-brand"
              {...form.register('paymentGateway')}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Banknote className="h-4 w-4" aria-hidden />
                Cash on delivery
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                Pay the courier when your order arrives. Nothing is charged now. A small
                cash-on-delivery handling fee is added to the total shown on your confirmation.
              </span>
            </span>
          </label>

          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Card and online payment methods are not enabled for this shop yet.
          </p>
        </section>
      </div>

      <Card className="space-y-5 p-5 lg:sticky lg:top-24">
        <h2 className="font-heading text-base font-semibold text-ink">Your order</h2>

        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li key={`${item.productId}:${item.variantId ?? ''}`} className="flex items-center gap-3">
              <ProductThumb name={item.name} className="h-11 w-11 shrink-0" textClassName="text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{item.name}</p>
                <p className="text-xs text-ink-muted">Qty {item.quantity}</p>
              </div>
              <p className="text-sm tabular-nums text-ink">
                {formatMinor(item.lineSubtotalMinor, cart.currency)}
              </p>
            </li>
          ))}
        </ul>

        <div className="border-t border-line pt-4">
          <OrderSummary figures={figures} couponCode={cart.couponCode} pending={pricing.isFetching} />
        </div>

        <p className="text-xs text-ink-muted" aria-live="polite">
          {pricing.data
            ? 'Shipping and tax calculated for your address. A cash-on-delivery fee is added on top.'
            : 'Shipping and tax are estimates until you enter a delivery address.'}
        </p>
        {/*
          The fee is disclosed but not shown as a figure, and deliberately not
          hardcoded here. `POST checkout/pricing` takes no `paymentGateway`
          (`checkoutPricingRequestSchema` has no such field) and `priceOrder` never
          adds the fee, so this panel cannot obtain the real amount — and copying
          the server's `COD_FEE_MINOR` constant into the browser would go stale the
          first time it changed. Flagged as an API gap rather than guessed at.
        */}

        {pricing.isError && (
          <Alert tone="info">
            We could not price this address. You can still place the order — the shop will confirm the final
            amount.
          </Alert>
        )}

        {placeOrder.isError && (
          <Alert>
            {placeOrder.error instanceof ApiError
              ? (placeOrder.error.fieldMessage ?? placeOrder.error.message)
              : 'We could not place your order. Please try again.'}
          </Alert>
        )}

        <Button type="submit" size="lg" loading={placeOrder.isPending} className="w-full">
          Place order
        </Button>

        <Link href="/cart" className="block text-center text-sm text-ink-muted hover:text-ink">
          Back to cart
        </Link>
      </Card>
    </form>
  );
}

/**
 * Re-prices the order as the address is typed, debounced.
 *
 * Debounced rather than per-keystroke because this is a real server-side pricing
 * calculation — tax rules and shipping rates — not a lookup, and firing one per
 * character would put a request behind every letter of a street name.
 *
 * Written as an effect over a manual fetch rather than a React Query key built
 * from the address: the address is a nine-field object, so a query key would
 * change identity on every keystroke and defeat the debounce it was meant to feed.
 */
function useLivePricing(cartId: string | null, values: CheckoutFormValues) {
  const [state, setState] = useState<{
    data: CheckoutPricingResponse | null;
    isFetching: boolean;
    isError: boolean;
  }>({ data: null, isFetching: false, isError: false });

  const priceable = isAddressPriceable(values);
  // Serialised so the effect compares by value; the object identity changes on
  // every render because `useWatch` rebuilds it.
  const addressKey = useMemo(
    () => (priceable ? JSON.stringify(toOrderAddress(values)) : ''),
    [priceable, values],
  );

  useEffect(() => {
    if (!cartId || !addressKey) {
      setState({ data: null, isFetching: false, isError: false });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, isFetching: true }));

    const timer = setTimeout(() => {
      api
        .request<CheckoutPricingResponse>('/checkout/pricing', {
          method: 'POST',
          body: { cartId, shippingAddress: JSON.parse(addressKey), shippingMethod: 'STANDARD' },
          signal: controller.signal,
        })
        .then((data) => setState({ data, isFetching: false, isError: false }))
        .catch((error: unknown) => {
          // An aborted request is a superseded keystroke, not a failure — showing
          // an error for it would make the panel flash red as the shopper types.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setState({ data: null, isFetching: false, isError: true });
        });
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cartId, addressKey]);

  return state;
}

/**
 * A random key per checkout attempt.
 *
 * `crypto.randomUUID` where available, with a random fallback for the older or
 * non-secure contexts where it is undefined — an idempotency key only has to be
 * unique, not a well-formed UUID.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
