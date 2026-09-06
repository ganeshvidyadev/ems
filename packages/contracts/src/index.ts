// @ems/contracts — the single source of truth for request/response shapes.
//
// The API validates with these schemas AND generates its Swagger document from
// them; the frontends infer their TypeScript types from the same objects. That
// is what makes a field rename a compile error in the console rather than a
// runtime 422 discovered by a merchant.

export * from './common/error-codes.js';
export * from './common/envelope.js';
export * from './common/primitives.js';
export * from './common/pagination.js';
export * from './auth/auth.contracts.js';
export * from './user/user.contracts.js';
export * from './tenant/tenant.contracts.js';
export * from './job/job.contracts.js';
export * from './brand/brand.contracts.js';
export * from './category/category.contracts.js';
export * from './tax/tax.contracts.js';
export * from './media/media.contracts.js';
export * from './product/product.contracts.js';
export * from './inventory/inventory.contracts.js';
export * from './customer/customer.contracts.js';
export * from './cart/cart.contracts.js';
export * from './coupon/coupon.contracts.js';
export * from './gift-card/gift-card.contracts.js';
export * from './loyalty/loyalty.contracts.js';
export * from './order/order.contracts.js';
export * from './checkout/checkout.contracts.js';
export * from './return/return.contracts.js';
export * from './shipment/shipment.contracts.js';
