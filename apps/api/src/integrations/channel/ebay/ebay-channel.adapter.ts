import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import type { ChannelsConfig } from '../../../config/configuration';
import type {
  ChannelAdapterPort,
  ChannelOrderStatusPush,
  ChannelTokenSet,
  ImportedChannelOrder,
  InventoryUpdateResult,
  OrderImportPage,
  PublishListingInput,
  PublishListingResult,
} from '../channel-adapter.port';

const OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

const IMPORT_PAGE_SIZE = 50;

interface EbayTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * eBay is the one channel with a genuine, complete adapter (docs/05 Phase
 * 10's own "Honest constraint" — Amazon SP-API, Flipkart, Facebook/Instagram
 * Shops and WhatsApp Business all require an external app-review process
 * this environment cannot complete, so faking "real" adapters for them would
 * be less honest, not more; `EBAY_CLIENT_ID` etc. being unset just means
 * `isConfigured()` is false until a real developer account is registered).
 *
 * Speaks eBay's actual modern REST surface: OAuth2 authorization-code grant,
 * the Sell Inventory API (inventory item → offer → publish) for listings,
 * and the Sell Fulfillment API for order import/status push-back.
 */
@Injectable()
export class EbayChannelAdapter implements ChannelAdapterPort {
  readonly type = 'EBAY' as const;
  private readonly logger = new Logger(EbayChannelAdapter.name);
  private readonly config: ChannelsConfig['ebay'];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<ChannelsConfig>('channels').ebay;
  }

  private get isSandbox(): boolean {
    return this.config.env === 'SANDBOX';
  }

  private get authBase(): string {
    return this.isSandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
  }

  private get apiBase(): string {
    return this.isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  }

  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUriName);
  }

  buildAuthorizeUrl(_redirectUri: string, state: string): string {
    // eBay's OAuth uses a pre-registered "RuName" in place of a literal redirect_uri
    // query param — the RuName itself encodes which URL eBay redirects back to.
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUriName,
      response_type: 'code',
      scope: OAUTH_SCOPES,
      state,
    });
    return `${this.authBase}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<ChannelTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUriName,
    });
    const token = await this.tokenRequest(body);
    return this.toTokenSet(token);
  }

  async refreshToken(refreshToken: string): Promise<ChannelTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: OAUTH_SCOPES,
    });
    const token = await this.tokenRequest(body);
    // A refresh response does not repeat the refresh token — eBay's grants are
    // long-lived (~18 months) and unchanged by a refresh; carry the old one forward.
    return { ...this.toTokenSet(token), refreshToken: token.refresh_token ?? refreshToken };
  }

  private async tokenRequest(body: URLSearchParams): Promise<EbayTokenResponse> {
    if (!this.isConfigured()) throw new ExternalServiceError('ebay', 'eBay credentials are not configured');

    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await fetch(`${this.apiBase}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ExternalServiceError('ebay', `eBay token request failed: ${text}`, { status: response.status });
    }
    return (await response.json()) as EbayTokenResponse;
  }

  private toTokenSet(token: EbayTokenResponse): ChannelTokenSet {
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: new Date(Date.now() + token.expires_in * 1_000),
    };
  }

  async publishListing(credentials: ChannelTokenSet, input: PublishListingInput): Promise<PublishListingResult> {
    // Step 1/3: create or replace the inventory item — the SKU-level product record.
    await this.request(credentials, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(input.externalSku)}`, {
      product: {
        title: input.title,
        description: input.description ?? input.title,
        imageUrls: input.images,
      },
      availability: {
        shipToLocationAvailability: { quantity: input.quantity },
      },
    });

    if (!input.categoryId) {
      return { externalListingId: input.externalSku, status: 'REJECTED', errorMessage: 'No category mapping configured for this product' };
    }

    // Step 2/3: create the offer — the SKU's price/listing-policy binding for one marketplace.
    const offer = await this.request<{ offerId: string }>(credentials, 'POST', '/sell/inventory/v1/offer', {
      sku: input.externalSku,
      marketplaceId: input.marketplaceId ?? 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: input.quantity,
      categoryId: input.categoryId,
      listingDescription: input.description ?? input.title,
      pricingSummary: { price: { value: minorToMajor(input.priceMinor, input.currency), currency: input.currency } },
    });

    // Step 3/3: publish the offer — makes it live and returns the buyer-facing listing id.
    const published = await this.request<{ listingId: string }>(
      credentials,
      'POST',
      `/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`,
    );

    return { externalListingId: published.listingId, status: 'LIVE' };
  }

  async updateInventory(credentials: ChannelTokenSet, externalListingId: string, quantity: number): Promise<InventoryUpdateResult> {
    // `externalListingId` here is the SKU (the same identifier `publishListing` created the
    // inventory item under) — inventory is updated at the SKU level, not the listing level.
    await this.request(credentials, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(externalListingId)}`, {
      availability: { shipToLocationAvailability: { quantity } },
    });
    return { confirmedQuantity: quantity };
  }

  async importOrdersSince(credentials: ChannelTokenSet, cursor: string | null): Promise<OrderImportPage> {
    const offset = cursor ? Number(cursor) : 0;
    const result = await this.request<{
      total: number;
      orders: Array<{
        orderId: string;
        creationDate: string;
        pricingSummary: { total: { value: string; currency: string } };
        buyer: { username: string };
        fulfillmentStartInstructions?: Array<{
          shippingStep?: {
            shipTo?: {
              fullName: string;
              contactAddress: {
                addressLine1: string;
                addressLine2?: string;
                city: string;
                stateOrProvince?: string;
                postalCode: string;
                countryCode: string;
              };
              primaryPhone?: { phoneNumber: string };
            };
          };
        }>;
        lineItems: Array<{ sku: string; quantity: number; lineItemCost: { value: string }; title: string }>;
      }>;
    }>(credentials, 'GET', `/sell/fulfillment/v1/order?limit=${IMPORT_PAGE_SIZE}&offset=${offset}`);

    const orders: ImportedChannelOrder[] = result.orders.map((order) => {
      const shipTo = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
      return {
        externalOrderId: order.orderId,
        placedAt: new Date(order.creationDate),
        currency: order.pricingSummary.total.currency,
        totalMinor: majorToMinor(order.pricingSummary.total.value, order.pricingSummary.total.currency),
        buyerName: shipTo?.fullName ?? order.buyer.username,
        buyerEmail: null,
        shippingAddress: shipTo
          ? {
              recipientName: shipTo.fullName,
              addressLine1: shipTo.contactAddress.addressLine1,
              addressLine2: shipTo.contactAddress.addressLine2 ?? null,
              city: shipTo.contactAddress.city,
              stateCode: shipTo.contactAddress.stateOrProvince ?? null,
              postalCode: shipTo.contactAddress.postalCode,
              countryCode: shipTo.contactAddress.countryCode,
              phone: shipTo.primaryPhone?.phoneNumber ?? null,
            }
          : null,
        lines: order.lineItems.map((line) => ({
          externalSku: line.sku,
          quantity: line.quantity,
          unitPriceMinor: majorToMinor(line.lineItemCost.value, order.pricingSummary.total.currency),
          title: line.title,
        })),
      };
    });

    const nextOffset = offset + result.orders.length;
    const nextCursor = nextOffset < result.total ? String(nextOffset) : null;

    return { orders, nextCursor };
  }

  async pushOrderStatus(
    credentials: ChannelTokenSet,
    externalOrderId: string,
    status: ChannelOrderStatusPush,
    trackingNumber?: string | null,
  ): Promise<void> {
    if (status !== 'SHIPPED') {
      // eBay's Fulfillment API models "ship" as an event; DELIVERED/CANCELLED are
      // buyer/carrier-driven states it reports to us, not ones a seller pushes.
      this.logger.debug(`No eBay push exists for status '${status}' — nothing to do`);
      return;
    }

    await this.request(credentials, 'POST', `/sell/fulfillment/v1/order/${encodeURIComponent(externalOrderId)}/shipping_fulfillment`, {
      lineItems: [],
      shippedDate: new Date().toISOString(),
      trackingNumber: trackingNumber ?? undefined,
    });
  }

  private async request<T = void>(
    credentials: ChannelTokenSet,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new ExternalServiceError('ebay', `eBay API request to ${path} failed: ${text}`, { status: response.status });
      }
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError('ebay', `eBay API request to ${path} errored: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** eBay's REST APIs use major-unit decimal strings for money — converts to/from our minor-unit convention without floats. */
export function minorToMajor(amountMinor: string, currency: string): string {
  const exponent = currency === 'JPY' ? 0 : 2;
  if (exponent === 0) return amountMinor;
  const value = amountMinor.padStart(exponent + 1, '0');
  return `${value.slice(0, -exponent)}.${value.slice(-exponent)}`;
}

export function majorToMinor(amountMajor: string, currency: string): string {
  const exponent = currency === 'JPY' ? 0 : 2;
  if (exponent === 0) return amountMajor;
  const [whole, fraction = ''] = amountMajor.split('.');
  return `${whole}${fraction.padEnd(exponent, '0').slice(0, exponent)}`;
}
