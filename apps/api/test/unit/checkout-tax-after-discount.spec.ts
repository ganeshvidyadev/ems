import 'reflect-metadata';
import { Money } from '@ems/kernel';
import { CheckoutService } from '../../src/modules/checkout/checkout.service';

// BUG-015: GST must be levied on each line's amount after its share of the discount.
describe('Checkout tax after discount', () => {
  const computeLineTax = jest.fn();
  const validateCoupon = jest.fn();
  let service: CheckoutService;
  const address = { countryCode: 'IN', stateCode: 'MH', postalCode: '400001' } as never;
  const product = (id: string, priceMinor: string) => ({
    id, status: 'ACTIVE', priceMinor, taxClassId: 'gst-18', trackInventory: true, allowBackorder: false, weightGrams: 500,
  });
  const products: Record<string, ReturnType<typeof product>> = {
    phone: product('phone', '2349900'),
    cable: product('cable', '49900'),
  };
  const cartWith = (items: { productId: string; quantity: number }[], couponCode: string | null) => ({
    storeId: 'store-1',
    currency: 'INR',
    couponCode,
    items: items.map((i) => ({ ...i, variantId: null, sku: i.productId, name: i.productId, variantTitle: null, imageUrl: null })),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(CheckoutService.prototype) as CheckoutService;
    computeLineTax.mockImplementation(async (_taxClassId: string, amount: Money) => ({
      taxRate: '18',
      taxMinor: amount.percentage('18'),
      breakup: [],
    }));
    Object.assign(service, {
      cart: { get: jest.fn() },
      cartProducts: {
        getProductById: async (id: string) => products[id],
        getVariantById: async () => null,
        defaultWarehouseOrigin: async () => null,
      },
      coupons: { validate: validateCoupon },
      tax: { computeLineTax },
    });
  });

  const price = async (items: { productId: string; quantity: number }[], couponCode: string | null) => {
    (service as unknown as { cart: { get: jest.Mock } }).cart.get.mockResolvedValue(cartWith(items, couponCode));
    return service.priceOrder('cart-1', address);
  };

  it('taxes the discounted amount (QA repro: 2 x Rs 23,499 with Rs 1,500 off)', async () => {
    validateCoupon.mockResolvedValue({ discount: Money.fromMinor('150000', 'INR') });
    const quote = await price([{ productId: 'phone', quantity: 2 }], 'EHSAVE15');

    expect(computeLineTax).toHaveBeenCalledWith('gst-18', Money.fromMinor('4549800', 'INR'), 'IN', 'MH');
    expect(quote.tax.amountMinor).toBe('818964'); // 18% of Rs 45,498, not of Rs 46,998
    expect(quote.total.amountMinor).toBe(String(4699800 - 150000 + 5000 + 818964));
  });

  it('taxes each line on its own share of a split discount', async () => {
    validateCoupon.mockResolvedValue({ discount: Money.fromMinor('100000', 'INR') });
    await price([{ productId: 'phone', quantity: 1 }, { productId: 'cable', quantity: 2 }], 'SAVE1000');

    const taxed = computeLineTax.mock.calls.map(([, amount]) => (amount as Money).amountMinor);
    // Rs 1,000 split 2,349,900 : 99,800 by largest remainder -> 95,926 + 4,074.
    expect(taxed).toEqual([2349900n - 95926n, 99800n - 4074n]);
  });

  it('is unchanged without a coupon', async () => {
    const quote = await price([{ productId: 'phone', quantity: 2 }], null);
    expect(validateCoupon).not.toHaveBeenCalled();
    expect(quote.tax.amountMinor).toBe('845964');
  });

  it('computes no tax without an address', async () => {
    (service as unknown as { cart: { get: jest.Mock } }).cart.get.mockResolvedValue(cartWith([{ productId: 'phone', quantity: 1 }], null));
    const quote = await service.priceOrder('cart-1');
    expect(computeLineTax).not.toHaveBeenCalled();
    expect(quote.tax.amountMinor).toBe('0');
  });
});
