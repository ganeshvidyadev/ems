import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { OrderPaymentService } from '../../src/modules/order-payment/order-payment.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import type { GatewayPayment } from '../../src/integrations/payment/payment-gateway.port';
import type { PaymentEntity } from '../../src/database/entities';

describe('Order payment settlement invariants', () => {
  let payment: PaymentEntity;
  let service: OrderPaymentService;
  const save = jest.fn();
  const findOneOrFail = jest.fn();
  const manager = {} as EntityManager;
  const verified = (patch: Partial<GatewayPayment> = {}): GatewayPayment => ({
    paymentId: 'pay_1', orderId: 'order_1', status: 'CAPTURED', amountMinor: '12000',
    currency: 'INR', method: 'UPI', raw: {}, ...patch,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    payment = { id: '1', publicId: 'payment-public', status: 'PENDING', gatewayOrderId: 'order_1',
      amountMinor: '12000', currency: 'INR', amountCapturedMinor: '0', amountRefundedMinor: '0' } as PaymentEntity;
    findOneOrFail.mockResolvedValue(payment);
    service = new OrderPaymentService(
      { withManager: () => ({ findOneOrFail, save }) } as never,
      {} as never, {} as never, new RequestContextService(),
    );
  });

  it.each(['PENDING', 'AUTHORIZED', 'FAILED'] as const)('preserves %s without capturing funds', async (status) => {
    await service.settle(manager, '1', verified({ status }));
    expect(payment.status).toBe(status);
    expect(payment.amountCapturedMinor).toBe('0');
    expect(payment.failedAt === null).toBe(status !== 'FAILED');
  });

  it('captures matching funds while holding a transaction row lock', async () => {
    await service.settle(manager, '1', verified());
    expect(findOneOrFail).toHaveBeenCalledWith({ where: { id: '1' }, lock: { mode: 'pessimistic_write' } });
    expect(payment.status).toBe('CAPTURED');
    expect(payment.amountCapturedMinor).toBe('12000');
  });

  it.each([
    { amountMinor: '11999' }, { amountMinor: '12001' }, { amountMinor: '-1' },
    { amountMinor: 'NaN' }, { currency: 'USD' }, { orderId: 'other-order' }, { orderId: null }, { paymentId: '' },
  ])('rejects mismatched provider evidence: %j', async (patch) => {
    await expect(service.settle(manager, '1', verified(patch))).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(payment.status).toBe('PENDING');
  });

  it.each(['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED'] as const)('does not regress %s on a delayed failure', async (status) => {
    payment.status = status;
    await service.settle(manager, '1', verified({ status: 'FAILED' }));
    expect(payment.status).toBe(status);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not turn an authorization into pending on out-of-order delivery', async () => {
    payment.status = 'AUTHORIZED';
    await service.settle(manager, '1', verified({ status: 'PENDING' }));
    expect(payment.status).toBe('AUTHORIZED');
    expect(save).not.toHaveBeenCalled();
  });
});
