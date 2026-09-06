import { StubShippingAdapter } from '../../src/integrations/shipping/stub/stub.adapter';
import type { CreateShipmentInput } from '../../src/integrations/shipping/shipping-carrier.port';

/**
 * The stub carrier is a genuine implementation of `ShippingCarrierPort`, not a
 * mock — it signs its own webhook payloads and verifies them in constant
 * time, so these tests exercise the exact same verification path the real
 * Shiprocket adapter's callers depend on, without any network access.
 */
describe('StubShippingAdapter', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const shipmentInput: CreateShipmentInput = {
    reference: 'SHP-TEST-1',
    orderReference: 'ORD-000001',
    fromAddress: {
      name: 'Warehouse',
      phone: '9999999999',
      addressLine1: '1 Industrial Area',
      city: 'Bengaluru',
      postalCode: '560001',
      countryCode: 'IN',
    },
    toAddress: {
      name: 'Shopper',
      phone: '9888888888',
      addressLine1: '2 MG Road',
      city: 'Mumbai',
      postalCode: '400001',
      countryCode: 'IN',
    },
    weightGrams: 500,
    isCod: false,
    currency: 'INR',
    items: [{ name: 'Widget', sku: 'WID-1', quantity: 1, unitPriceMinor: '10000' }],
  };

  it('reports a normal pincode as serviceable', async () => {
    const adapter = new StubShippingAdapter();
    const result = await adapter.checkServiceability({
      originPincode: '560001',
      destinationPincode: '400001',
      weightGrams: 500,
      isCod: false,
    });
    expect(result.serviceable).toBe(true);
  });

  it('blocks a pincode ending in the reserved unserviceable suffix', async () => {
    const adapter = new StubShippingAdapter();
    const result = await adapter.checkServiceability({
      originPincode: '560001',
      destinationPincode: '400000',
      weightGrams: 500,
      isCod: false,
    });
    expect(result.serviceable).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns no rates for an unserviceable destination', async () => {
    const adapter = new StubShippingAdapter();
    const rates = await adapter.getRates({
      originPincode: '560001',
      destinationPincode: '400000',
      weightGrams: 500,
      isCod: false,
    });
    expect(rates).toHaveLength(0);
  });

  it('quotes at least a STANDARD and EXPRESS rate for a serviceable route', async () => {
    const adapter = new StubShippingAdapter();
    const rates = await adapter.getRates({
      originPincode: '560001',
      destinationPincode: '400001',
      weightGrams: 500,
      isCod: false,
    });
    expect(rates.map((r) => r.serviceType).sort()).toEqual(['EXPRESS', 'STANDARD']);
    expect(BigInt(rates.find((r) => r.serviceType === 'EXPRESS')!.rateMinor)).toBeGreaterThan(
      BigInt(rates.find((r) => r.serviceType === 'STANDARD')!.rateMinor),
    );
  });

  it('creates a shipment with an AWB and tracks it through label creation', async () => {
    const adapter = new StubShippingAdapter();
    const shipment = await adapter.createShipment(shipmentInput);
    expect(shipment.awbNumber).toBeTruthy();

    const tracking = await adapter.track(shipment.awbNumber!);
    expect(tracking.currentStatus).toBe('LABEL_CREATED');
    expect(tracking.events).toHaveLength(1);
  });

  it('advances through pickup, transit and delivery, accumulating tracking events', async () => {
    const adapter = new StubShippingAdapter();
    const shipment = await adapter.createShipment(shipmentInput);
    const awb = shipment.awbNumber!;

    await adapter.schedulePickup({ fromAddress: shipmentInput.fromAddress, awbNumbers: [awb], pickupDate: '2026-01-01' });
    adapter.advance(awb, 'IN_TRANSIT', 'Left origin facility');
    adapter.advance(awb, 'DELIVERED', 'Delivered to recipient');

    const tracking = await adapter.track(awb);
    expect(tracking.currentStatus).toBe('DELIVERED');
    expect(tracking.events.map((e) => e.status)).toEqual([
      'LABEL_CREATED',
      'PICKUP_SCHEDULED',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
  });

  it('supports return-to-origin after a failed delivery', async () => {
    const adapter = new StubShippingAdapter();
    const shipment = await adapter.createShipment(shipmentInput);
    const awb = shipment.awbNumber!;

    adapter.advance(awb, 'FAILED_DELIVERY', 'Recipient unavailable');
    await adapter.initiateRto(awb, 'Recipient refused delivery');

    const tracking = await adapter.track(awb);
    expect(tracking.currentStatus).toBe('RTO_INITIATED');
  });

  it('rejects a webhook with an invalid signature', async () => {
    const adapter = new StubShippingAdapter();
    const shipment = await adapter.createShipment(shipmentInput);
    const body = JSON.stringify({ awb: shipment.awbNumber, status: 'DELIVERED' });

    const result = await adapter.verifyWebhook(Buffer.from(body), {
      'x-stub-carrier-signature': 'not-a-real-signature',
    });
    expect(result.valid).toBe(false);
  });

  it('accepts a correctly signed webhook and extracts the AWB', async () => {
    const adapter = new StubShippingAdapter();
    const shipment = await adapter.createShipment(shipmentInput);
    const { body, signature } = adapter.buildWebhookPayload(shipment.awbNumber!, 'DELIVERED');

    const result = await adapter.verifyWebhook(Buffer.from(body), { 'x-stub-carrier-signature': signature });
    expect(result.valid).toBe(true);
    expect(result.awbNumber).toBe(shipment.awbNumber);
  });

  it('throws for an unknown AWB rather than silently returning empty tracking', async () => {
    const adapter = new StubShippingAdapter();
    await expect(adapter.track('UNKNOWN-AWB')).rejects.toThrow();
  });
});
