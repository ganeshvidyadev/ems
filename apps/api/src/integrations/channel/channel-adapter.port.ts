import type { ChannelType } from '../../database/entities';

export interface ChannelTokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry of `accessToken` — drives both proactive refresh and the merchant-facing alert. */
  expiresAt: Date;
  scope?: string | null;
  /** The channel's own seller/account id, discovered at token-exchange time. */
  externalAccountId?: string | null;
}

export interface PublishListingInput {
  externalSku: string;
  title: string;
  description: string | null;
  priceMinor: string;
  currency: string;
  quantity: number;
  /** Resolved from `channel.settings.categoryMapping[merchantCategoryName]` by the caller — the adapter never guesses a category. */
  categoryId: string | null;
  images: string[];
  marketplaceId: string | null;
}

export interface PublishListingResult {
  externalListingId: string;
  status: 'LIVE' | 'PENDING' | 'REJECTED';
  errorMessage?: string | null;
}

export interface InventoryUpdateResult {
  /** What the channel confirms it now believes the stock is — the drift-detection baseline for the *next* sync. */
  confirmedQuantity: number;
}

export interface ImportedOrderLine {
  externalSku: string;
  quantity: number;
  unitPriceMinor: string;
  title: string;
}

export interface ImportedChannelOrder {
  externalOrderId: string;
  placedAt: Date;
  currency: string;
  totalMinor: string;
  buyerName: string | null;
  buyerEmail: string | null;
  shippingAddress: {
    recipientName: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    stateCode: string | null;
    postalCode: string;
    countryCode: string;
    phone: string | null;
  } | null;
  lines: ImportedOrderLine[];
}

export interface OrderImportPage {
  orders: ImportedChannelOrder[];
  /** Opaque — persisted verbatim on `channels.last_order_cursor` and handed back unchanged on the next call. `null` means "caught up". */
  nextCursor: string | null;
}

export type ChannelOrderStatusPush = 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

/**
 * The contract every sales-channel integration implements — depend on
 * *intent* ("publish this listing", "import orders since this cursor"),
 * never on a marketplace SDK, the same reason `PaymentGatewayPort` and
 * `ShippingCarrierPort` exist.
 *
 * Every method takes the tenant's own decrypted `ChannelTokenSet` as a
 * parameter rather than reading it from adapter-level config: unlike a
 * payment gateway (one platform-wide merchant key), a sales channel's
 * credentials are a per-tenant OAuth grant stored on `channels.credentials_encrypted`
 * — `ChannelService` decrypts it immediately before each call and never
 * persists the plaintext anywhere else.
 */
export interface ChannelAdapterPort {
  readonly type: ChannelType;

  isConfigured(): boolean;

  /** The URL to send the merchant to; `state` must be echoed back unchanged by the callback (CSRF protection). */
  buildAuthorizeUrl(redirectUri: string, state: string): string;

  exchangeCodeForToken(code: string, redirectUri: string): Promise<ChannelTokenSet>;

  refreshToken(refreshToken: string): Promise<ChannelTokenSet>;

  publishListing(credentials: ChannelTokenSet, input: PublishListingInput): Promise<PublishListingResult>;

  updateInventory(credentials: ChannelTokenSet, externalListingId: string, quantity: number): Promise<InventoryUpdateResult>;

  /** `cursor === null` means "from the beginning" — a channel's first-ever import. */
  importOrdersSince(credentials: ChannelTokenSet, cursor: string | null): Promise<OrderImportPage>;

  pushOrderStatus(
    credentials: ChannelTokenSet,
    externalOrderId: string,
    status: ChannelOrderStatusPush,
    trackingNumber?: string | null,
  ): Promise<void>;
}

export const CHANNEL_ADAPTER_PORT = Symbol('CHANNEL_ADAPTER_PORT');
