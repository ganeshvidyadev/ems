import 'reflect-metadata';
import { Money } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import { OrderPaymentService } from '../../src/modules/order-payment/order-payment.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import type { PaymentEntity } from '../../src/database/entities';

describe('Order refunds', () => {
  const gatewayRefund = jest.fn();
  const insert = jest.fn();
  const save = jest.fn();
  const outstanding = jest.fn();
  let service: OrderPaymentService;
  let payment: PaymentEntity;
  const manager = {} as EntityManager;

  beforeEach(() => {
    jest.clearAllMocks();
    payment = {
      id: '1',
      orderId: '2',
      gateway: 'RAZORPAY',
      gatewayPaymentId: 'pay_1',
      status: 'CAPTURED',
      amountCapturedMinor: '10000',
      amountRefundedMinor: '0',
      currency: 'INR',
    } as PaymentEntity;
    outstanding.mockResolvedValue([]);
    insert.mockImplementation(async (row) => row);
    service = new OrderPaymentService(
      { withManager: () => ({ findOneOrFail: async () => payment, save }) } as never,
      {
        withManager: () => ({ findByIdempotencyKey: async () => null, find: outstanding, insert }),
      } as never,
      { resolve: () => ({ refund: gatewayRefund }) } as never,
      new RequestContextService(),
    );
  });

  it.each([
    ['processed', 'COMPLETED'],
    ['succeeded', 'COMPLETED'],
    ['SUCCESS', 'COMPLETED'],
    ['PENDING', 'PENDING'],
    ['unknown', 'PENDING'],
    ['FAILED', 'FAILED'],
  ])('records provider %s as %s', async (providerStatus, expected) => {
    gatewayRefund.mockResolvedValue({ refundId: 'refund_1', status: providerStatus });
    const result = await service.refund(
      manager,
      payment,
      Money.fromMinor('4000', 'INR'),
      null,
      null,
      'key',
    );
    expect(result.status).toBe(expected);
    expect(payment.amountRefundedMinor).toBe(expected === 'COMPLETED' ? '4000' : '0');
    expect(save).toHaveBeenCalledTimes(expected === 'COMPLETED' ? 1 : 0);
    expect(result.processedAt !== null).toBe(expected === 'COMPLETED');
  });

  it('reserves capacity for a pending refund', async () => {
    outstanding.mockResolvedValue([{ amountMinor: '8000' }]);
    await expect(
      service.refund(manager, payment, Money.fromMinor('3000', 'INR'), null, null, 'key'),
    ).rejects.toThrow();
    expect(gatewayRefund).not.toHaveBeenCalled();
  });

  it('rejects a zero amount before contacting the provider', async () => {
    await expect(
      service.refund(manager, payment, Money.zero('INR'), null, null, 'key'),
    ).rejects.toThrow('positive');
    expect(gatewayRefund).not.toHaveBeenCalled();
  });
});
