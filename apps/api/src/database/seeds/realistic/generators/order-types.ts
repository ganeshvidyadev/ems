import type { AddressModel, CustomerModel } from './customers';
import type { ProductModel, VariantModel } from './catalog';

export type PaymentMethodCode = 'COD' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'EMI';

/** The business outcome an order is generated to have; drives its whole lifecycle. */
export type Outcome =
  | 'DELIVERED'
  | 'SHIPPED'
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'PENDING'
  | 'PENDING_FAILED'
  | 'ON_HOLD'
  | 'CANCELLED_PENDING'
  | 'CANCELLED_CONFIRMED'
  | 'RTO'
  | 'RETURN_COMPLETED'
  | 'RETURN_REJECTED'
  | 'RETURN_RECEIVED'
  | 'RETURN_APPROVED'
  | 'RETURN_REQUESTED';

export interface TaxPart {
  name: string;
  rate: string;
  amountMinor: string;
}

export interface Allocation {
  warehouse: string;
  qty: number;
}

export interface LineModel {
  itemNk: string;
  product: ProductModel;
  variant: VariantModel | null;
  qty: number;
  sku: string;
  name: string;
  variantTitle: string | null;
  imageUrl: string;
  hsn: string;
  unitMinor: number;
  costMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  taxRate: string;
  taxMinor: number;
  taxBreakup: TaxPart[];
  totalMinor: number;
  qtyFulfilled: number;
  qtyReturned: number;
  qtyCancelled: number;
  allocations: Allocation[];
}

export interface CouponModel {
  code: string;
  spec: import('../types').CouponSpec;
  startsAt: Date;
  endsAt: Date | null;
  usageCount: number;
}

export interface HistoryEntry {
  type: 'ORDER' | 'PAYMENT' | 'FULFILMENT';
  from: string | null;
  to: string;
  reason: string | null;
  actor: 'USER' | 'CUSTOMER' | 'SYSTEM' | 'WEBHOOK';
  /** Staff key (e.g. `orders`) when `actor` is USER. */
  staffKey: string | null;
  at: Date;
}

export interface PaymentModel {
  nk: string;
  gateway: 'COD' | 'STUB';
  method: PaymentMethodCode;
  status: 'INITIATED' | 'PENDING' | 'CAPTURED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amountMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  createdAt: Date;
  updatedAt: Date;
  capturedAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  feeMinor: number | null;
  feeTaxMinor: number | null;
  netMinor: number | null;
  cardLast4: string | null;
  cardBrand: string | null;
  cardNetwork: string | null;
  upiVpa: string | null;
  bankName: string | null;
  reconciledAt: Date | null;
}

export interface RefundModel {
  nk: string;
  paymentNk: string;
  amountMinor: number;
  reason: string;
  status: 'COMPLETED';
  at: Date;
  returnRma: string | null;
}

export interface ShipmentEventModel {
  status: string;
  at: Date;
  location: string;
  description: string;
}

export interface ShipmentModel {
  number: string;
  awb: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  warehouse: string;
  service: 'STANDARD' | 'EXPRESS';
  items: { line: LineModel; qty: number }[];
  weightG: number;
  isCod: boolean;
  codAmountMinor: number;
  costMinor: number;
  pickedUpAt: Date | null;
  shippedAt: Date | null;
  expectedDeliveryAt: Date | null;
  deliveredAt: Date | null;
  rtoInitiatedAt: Date | null;
  events: ShipmentEventModel[];
}

export interface ReturnModel {
  rma: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'INSPECTED' | 'COMPLETED';
  reason: string;
  reasonDetail: string;
  createdAt: Date;
  approvedAt: Date | null;
  receivedAt: Date | null;
  inspectedAt: Date | null;
  completedAt: Date | null;
  inspection: 'RESELLABLE' | 'DAMAGED' | 'SCRAP' | null;
  rejectedReason: string | null;
  refundMinor: number | null;
  restockingFeeMinor: number;
  items: { line: LineModel; qty: number; restock: boolean; refundMinor: number | null; note: string }[];
}

export interface OrderModel {
  seq: number;
  number: string;
  outcome: Outcome;
  createdAt: Date;
  updatedAt: Date;
  customer: CustomerModel;
  address: AddressModel;
  method: PaymentMethodCode;
  lines: LineModel[];
  coupon: CouponModel | null;
  redeemsCoupon: boolean;
  express: boolean;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  codFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  placedAt: Date | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  customerNote: string | null;
  internalNote: string | null;
  tags: string[] | null;
  userAgent: string;
  utm: Record<string, string> | null;
  history: HistoryEntry[];
  payments: PaymentModel[];
  refunds: RefundModel[];
  shipments: ShipmentModel[];
  returns: ReturnModel[];
  /** When stock is reserved / committed / released, for the inventory timeline. */
  reservedAt: Date;
  committedAt: Date | null;
  releasedAt: Date | null;
  cancelRestockAt: Date | null;
  /** When a return-to-origin parcel reached the warehouse again (restock). */
  rtoAt: Date | null;
}
