import 'reflect-metadata';
import { OrderPaymentWebhookController } from '../../src/modules/checkout/order-payment-webhook.controller';
import { CheckoutService } from '../../src/modules/checkout/checkout.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import type { GatewayPayment } from '../../src/integrations/payment/payment-gateway.port';

const authoritative: GatewayPayment = {
  paymentId: 'pay_1', orderId: 'order_1', status: 'CAPTURED', amountMinor: '12000',
  currency: 'INR', method: 'UPI', raw: {},
};

describe('Order webhook trust and retry boundary', () => {
  const verifyWebhook = jest.fn();
  const fetchPayment = jest.fn();
  const settleWebhook = jest.fn();
  const enqueue = jest.fn();
  let controller: OrderPaymentWebhookController;
  const request = () => ({ params: { gateway: 'razorpay' }, headers: {}, rawBody: Buffer.from('{}') }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyWebhook.mockResolvedValue({ valid: true, event: 'payment.captured', eventId: 'pay_1',
      payload: { payload: { payment: { entity: { id: 'pay_1', amount: 1, tenantId: 'attacker' } } } } });
    fetchPayment.mockResolvedValue(authoritative);
    settleWebhook.mockResolvedValue({});
    controller = new OrderPaymentWebhookController(
      { resolve: () => ({ verifyWebhook, fetchPayment }) } as never,
      { settleWebhook } as never, { enqueue } as never,
    );
  });

  it('uses the authoritative response and avoids logging provider bodies', async () => {
    await controller.handle(request());
    expect(settleWebhook).toHaveBeenCalledWith('razorpay', authoritative, 'payment.captured:pay_1');
    expect(enqueue.mock.calls[0]![1]).not.toHaveProperty('payload');
  });

  it('propagates processing failure and processes the retry', async () => {
    settleWebhook.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(controller.handle(request())).rejects.toThrow('database unavailable');
    await expect(controller.handle(request())).resolves.toEqual({ received: true });
    expect(settleWebhook).toHaveBeenCalledTimes(2);
  });

  it('does not fetch or settle an invalid signature', async () => {
    verifyWebhook.mockResolvedValue({ valid: false, payload: {} });
    await expect(controller.handle(request())).rejects.toThrow('Invalid webhook signature');
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(settleWebhook).not.toHaveBeenCalled();
  });

  it('requires the original signed bytes', async () => {
    await expect(controller.handle({ params: { gateway: 'razorpay' }, headers: {}, body: {} } as never)).rejects.toThrow('Raw webhook body');
    expect(verifyWebhook).not.toHaveBeenCalled();
  });
});

describe('Verified order webhook tenant resolution', () => {
  const context = new RequestContextService();
  const query = jest.fn();
  let service: CheckoutService;
  let settle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(CheckoutService.prototype) as CheckoutService;
    settle = jest.fn(async () => ({ status: context.requireTenantId(), orderId: null, orderNumber: null }));
    Object.assign(service, { manager: { query }, context, settleAndConfirm: settle });
  });

  it('switches only into the tenant found from persisted gateway references and restores context', async () => {
    query.mockResolvedValue([{ tenantId: 'tenant-a' }]);
    await context.run(RequestContextService.systemContext({ tenantId: 'forged-tenant-b' }), async () => {
      const result = await service.settleWebhook('razorpay', authoritative, 'event-1');
      expect(result.status).toBe('tenant-a');
      expect(context.tenantId).toBe('forged-tenant-b');
    });
    expect(query.mock.calls[0]![1]).toEqual(['RAZORPAY', 'pay_1', 'order_1']);
  });

  it.each([{ rows: [] }, { rows: [{ tenantId: 'a' }, { tenantId: 'b' }] }])('rejects absent or ambiguous matches: %j', async ({ rows }) => {
    query.mockResolvedValue(rows);
    await expect(service.settleWebhook('razorpay', authoritative, 'event-1')).rejects.toThrow();
    expect(settle).not.toHaveBeenCalled();
  });
});
