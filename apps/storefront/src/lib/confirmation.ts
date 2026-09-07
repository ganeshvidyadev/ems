import type { PlaceOrderResponse } from '@ems/contracts';

/**
 * How a placed order reaches the confirmation page.
 *
 * There is no public endpoint to read an order back: the storefront API exposes
 * no order-lookup route, and the console ones are permission-gated — correctly,
 * since a guest order has no authenticated owner to check against. So the
 * `POST checkout/orders` response is the only copy of the order number and total
 * the browser will ever hold, and it is handed across the navigation in
 * `sessionStorage`.
 *
 * `sessionStorage` rather than `localStorage` deliberately: it is scoped to the
 * tab and cleared when that tab closes, which is right for a one-time receipt.
 * The consequence is that a hard refresh or a shared link shows nothing — which
 * is why the confirmation page has an honest fallback rather than rendering
 * `undefined` into a receipt.
 */
export const CONFIRMATION_STORAGE_KEY = 'ems-last-order';

/**
 * Reads and validates the stored order.
 *
 * Shape-checked rather than trusted: this is client-writable storage, and a
 * half-written or stale entry from an older build should produce the fallback
 * message, not a receipt with blank fields.
 */
export function readStoredOrder(): PlaceOrderResponse | null {
  try {
    const raw = window.sessionStorage.getItem(CONFIRMATION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PlaceOrderResponse> | null;
    if (
      !parsed ||
      typeof parsed.orderNumber !== 'string' ||
      typeof parsed.orderId !== 'string' ||
      typeof parsed.total !== 'object' ||
      parsed.total === null ||
      typeof (parsed.total as { amountMinor?: unknown }).amountMinor !== 'string'
    ) {
      return null;
    }

    return parsed as PlaceOrderResponse;
  } catch {
    return null;
  }
}

/** Cleared once shown, so a later visit to the URL does not re-present a stale receipt. */
export function clearStoredOrder(): void {
  try {
    window.sessionStorage.removeItem(CONFIRMATION_STORAGE_KEY);
  } catch {
    // Nothing to do — storage being unavailable is why there was nothing to read.
  }
}
