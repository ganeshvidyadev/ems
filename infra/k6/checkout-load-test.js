import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * The Phase 12 exit criterion, verbatim: "500 rps checkout sustained within
 * p95 targets." One iteration is one full guest-checkout: create a cart, add
 * an item, price it, place a COD order — the same four calls a real
 * storefront makes, not a synthetic single-endpoint hammer.
 *
 * `BASE_URL`/`STORE_ID`/`PRODUCT_ID` are environment-specific — point
 * `STORE_ID`/`PRODUCT_ID` at real seeded catalog data (e.g. this session's
 * own demo store/product, or a dedicated load-test tenant so real merchant
 * data is never touched) before running.
 *
 *   k6 run -e BASE_URL=https://staging.ems.example.com \
 *          -e STORE_ID=01M1W1MAYS3746WD70SB4ZZPGA \
 *          -e PRODUCT_ID=01M1W1VMWF4YAM5HZ6AA8AZ16B \
 *          infra/k6/checkout-load-test.js
 *
 * Unexercised in this environment — no k6 binary and no staging deployment
 * to point it at — but every request shape here matches a real controller
 * route verified live earlier in Phase 12 (`CartController`,
 * `CheckoutController`), not guessed from the contracts alone.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const STORE_ID = __ENV.STORE_ID;
const PRODUCT_ID = __ENV.PRODUCT_ID;

const checkoutFailureRate = new Rate('checkout_failures');
const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  scenarios: {
    checkout: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 800,
      stages: [
        { target: 100, duration: '1m' },
        { target: 500, duration: '3m' }, // the sustained 500 rps target
        { target: 500, duration: '5m' },
        { target: 0, duration: '1m' },
      ],
    },
  },
  thresholds: {
    // The roadmap says "within p95 targets" without naming one; 500ms is a
    // reasonable checkout-write budget and the number this script actually
    // enforces — tune per real infra once a staging environment exists.
    http_req_duration: ['p(95)<500'],
    checkout_failures: ['rate<0.01'],
  },
};

export default function checkout() {
  if (!STORE_ID || !PRODUCT_ID) {
    throw new Error('STORE_ID and PRODUCT_ID must be set — see this file\'s own doc comment');
  }

  const start = Date.now();
  const headers = { 'Content-Type': 'application/json' };

  // 1. Create a cart.
  const cartRes = http.post(`${BASE_URL}/api/v1/storefront/cart?storeId=${STORE_ID}`, null, { headers });
  const cartOk = check(cartRes, { 'cart created': (r) => r.status === 201 || r.status === 200 });
  if (!cartOk) return fail();

  const cartId = JSON.parse(cartRes.body).data.id;

  // 2. Add an item.
  const addItemRes = http.post(
    `${BASE_URL}/api/v1/storefront/cart/${cartId}/items?storeId=${STORE_ID}`,
    JSON.stringify({ productId: PRODUCT_ID, quantity: 1 }),
    { headers },
  );
  if (!check(addItemRes, { 'item added': (r) => r.status === 200 })) return fail();

  // 3. Price it.
  const pricingRes = http.post(
    `${BASE_URL}/api/v1/storefront/checkout/pricing`,
    JSON.stringify({ cartId, storeId: STORE_ID }),
    { headers },
  );
  if (!check(pricingRes, { 'priced': (r) => r.status === 200 })) return fail();

  // 4. Place the order — COD, so this never touches a real payment gateway.
  const orderRes = http.post(
    `${BASE_URL}/api/v1/storefront/checkout/orders`,
    JSON.stringify({
      cartId,
      storeId: STORE_ID,
      email: `loadtest+${__VU}-${__ITER}@example.com`,
      paymentGateway: 'cod',
      shippingAddress: {
        recipientName: 'Load Test',
        addressLine1: '1 Test Street',
        city: 'Bengaluru',
        stateCode: 'KA',
        postalCode: '560001',
        countryCode: 'IN',
      },
    }),
    { headers },
  );
  const orderOk = check(orderRes, { 'order placed': (r) => r.status === 201 || r.status === 200 });

  checkoutFailureRate.add(!orderOk);
  checkoutDuration.add(Date.now() - start);
  if (!orderOk) return fail();

  sleep(1);
}

function fail() {
  checkoutFailureRate.add(true);
}
