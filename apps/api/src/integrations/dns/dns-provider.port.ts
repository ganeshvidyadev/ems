/**
 * The contract for publishing an ACME DNS-01 challenge record — the same
 * "depend on intent, not a provider SDK" shape as `PaymentGatewayPort` and
 * `ShippingCarrierPort`.
 *
 * **This is not general-purpose DNS management for a merchant's own zone.**
 * We have no credentials for a merchant's registrar, and a platform that did
 * would be an enormous blast-radius risk for a single leaked token. Instead,
 * every adapter here manages records **inside a zone the platform itself
 * owns** (`DomainsConfig.challengeDelegateDomain`) — the merchant CNAMEs
 * their own `_acme-challenge.<hostname>` to a subdomain of ours *once*, and
 * DNS-01 validation follows that CNAME to a TXT record we publish and
 * control. This is the same delegation pattern Vercel/Netlify/Shopify use so
 * a custom domain never requires handing us registrar access.
 */
export interface DnsProviderPort {
  readonly name: 'cloudflare' | 'stub';

  isConfigured(): boolean;

  /**
   * Publishes a TXT record at `{subdomain}.{challengeDelegateDomain}`.
   * `subdomain` is ours to choose (typically the domain row's id) — never a
   * merchant-controlled value, so there is nothing here for a merchant to
   * inject into a zone they should not be able to write to.
   */
  createTxtRecord(subdomain: string, value: string): Promise<{ recordId: string }>;

  deleteTxtRecord(recordId: string): Promise<void>;
}

export const DNS_PROVIDER_PORT = Symbol('DNS_PROVIDER_PORT');
