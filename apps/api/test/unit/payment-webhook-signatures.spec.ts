import { createHash, createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { RazorpayAdapter } from '../../src/integrations/payment/razorpay/razorpay.adapter';
import { StripeAdapter } from '../../src/integrations/payment/stripe/stripe.adapter';
import { CashfreeAdapter } from '../../src/integrations/payment/cashfree/cashfree.adapter';
import { PhonePeAdapter } from '../../src/integrations/payment/phonepe/phonepe.adapter';

/**
 * Phase 6 exit criterion: "each gateway passes recorded-fixture tests plus
 * failure-mode tests (timeout, 500, malformed body, bad signature)".
 *
 * These cover the failure-mode half for every gateway whose webhook can be
 * verified without a network call (all but PayPal, which calls PayPal's own
 * verify-webhook-signature API and so has nothing meaningful to fixture-test
 * offline). A forged or replayed-with-tampering webhook must never be
 * accepted — that is the one property that matters most here, since a false
 * "valid" is how a webhook forges a payment as captured.
 */
function fakeConfigService(payment: Record<string, unknown>): ConfigService {
  return { getOrThrow: () => payment } as unknown as ConfigService;
}

describe('RazorpayAdapter.verifyWebhook', () => {
  const secret = 'razorpay-webhook-secret';
  const adapter = new RazorpayAdapter(
    fakeConfigService({ razorpay: { keyId: 'k', keySecret: 's', webhookSecret: secret } }),
  );

  function sign(body: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  it('accepts a correctly signed webhook', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } });
    const result = await adapter.verifyWebhook(Buffer.from(body), { 'x-razorpay-signature': sign(body) });
    expect(result.valid).toBe(true);
    expect(result.event).toBe('payment.captured');
    expect(result.eventId).toBe('pay_1');
  });

  it('rejects a tampered body against a signature computed for the original', async () => {
    const original = JSON.stringify({ event: 'payment.captured', payload: {} });
    const signature = sign(original);
    const tampered = JSON.stringify({ event: 'payment.failed', payload: {} });
    const result = await adapter.verifyWebhook(Buffer.from(tampered), { 'x-razorpay-signature': signature });
    expect(result.valid).toBe(false);
  });

  it('rejects a missing signature header', async () => {
    const result = await adapter.verifyWebhook(Buffer.from('{}'), {});
    expect(result.valid).toBe(false);
  });

  it('rejects a malformed (non-JSON) body even with a matching signature', async () => {
    const body = 'not json';
    const result = await adapter.verifyWebhook(Buffer.from(body), { 'x-razorpay-signature': sign(body) });
    expect(result.valid).toBe(false);
  });
});

describe('StripeAdapter.verifyWebhook', () => {
  const secret = 'stripe-webhook-secret';
  const adapter = new StripeAdapter(
    fakeConfigService({ stripe: { secretKey: 'sk', publishableKey: 'pk', webhookSecret: secret } }),
  );

  function sign(body: string, timestamp: number): string {
    const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    return `t=${timestamp},v1=${v1}`;
  }

  it('accepts a signature within the tolerance window', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const timestamp = Math.floor(Date.now() / 1000);
    const result = await adapter.verifyWebhook(Buffer.from(body), { 'stripe-signature': sign(body, timestamp) });
    expect(result.valid).toBe(true);
    expect(result.event).toBe('payment_intent.succeeded');
    expect(result.eventId).toBe('evt_1');
  });

  it('rejects a signature older than the 5-minute tolerance (replay protection)', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60;
    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'stripe-signature': sign(body, staleTimestamp),
    });
    expect(result.valid).toBe(false);
  });

  it('rejects an invalid v1 signature', async () => {
    const body = JSON.stringify({ id: 'evt_1' });
    const timestamp = Math.floor(Date.now() / 1000);
    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'stripe-signature': `t=${timestamp},v1=${'0'.repeat(64)}`,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a header missing the v1 component', async () => {
    const result = await adapter.verifyWebhook(Buffer.from('{}'), {
      'stripe-signature': `t=${Math.floor(Date.now() / 1000)}`,
    });
    expect(result.valid).toBe(false);
  });
});

describe('CashfreeAdapter.verifyWebhook', () => {
  const secret = 'cashfree-webhook-secret';
  const adapter = new CashfreeAdapter(
    fakeConfigService({ cashfree: { appId: 'a', secretKey: 's', webhookSecret: secret, env: 'SANDBOX' } }),
  );

  function sign(body: string, timestamp: string): string {
    return createHmac('sha256', secret).update(`${timestamp}${body}`).digest('base64');
  }

  it('accepts a correctly signed webhook', async () => {
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'ord_1' } } });
    const timestamp = String(Date.now());
    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'x-webhook-signature': sign(body, timestamp),
      'x-webhook-timestamp': timestamp,
    });
    expect(result.valid).toBe(true);
    expect(result.eventId).toBe(`ord_1:${timestamp}`);
  });

  it('rejects an invalid base64 signature', async () => {
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const timestamp = String(Date.now());
    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'x-webhook-signature': Buffer.from('wrong-signature').toString('base64'),
      'x-webhook-timestamp': timestamp,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a missing timestamp header', async () => {
    const body = '{}';
    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'x-webhook-signature': sign(body, String(Date.now())),
    });
    expect(result.valid).toBe(false);
  });
});

describe('PhonePeAdapter.verifyWebhook', () => {
  const saltKey = 'phonepe-salt-key';
  const saltIndex = '1';
  const adapter = new PhonePeAdapter(
    fakeConfigService({ phonepe: { merchantId: 'M1', saltKey, saltIndex, env: 'SANDBOX' } }),
  );

  function sign(base64Payload: string): string {
    return `${createHash('sha256').update(`${base64Payload}${saltKey}`).digest('hex')}###${saltIndex}`;
  }

  it('accepts a correctly checksummed callback', async () => {
    const decoded = { code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: 'txn_1' } };
    const base64Payload = Buffer.from(JSON.stringify(decoded)).toString('base64');
    const body = JSON.stringify({ response: base64Payload });

    const result = await adapter.verifyWebhook(Buffer.from(body), { 'x-verify': sign(base64Payload) });
    expect(result.valid).toBe(true);
    expect(result.event).toBe('PAYMENT_SUCCESS');
    expect(result.eventId).toBe('txn_1');
  });

  it('rejects an invalid checksum', async () => {
    const decoded = { code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: 'txn_1' } };
    const base64Payload = Buffer.from(JSON.stringify(decoded)).toString('base64');
    const body = JSON.stringify({ response: base64Payload });

    const result = await adapter.verifyWebhook(Buffer.from(body), { 'x-verify': `deadbeef###${saltIndex}` });
    expect(result.valid).toBe(false);
  });

  it('rejects a missing X-VERIFY header', async () => {
    const result = await adapter.verifyWebhook(Buffer.from('{}'), {});
    expect(result.valid).toBe(false);
  });
});
