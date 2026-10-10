import { TARGETS, validateSpec } from './catalogs';
import { COUNTED_STATUSES, finalizeCommerce } from './generators/marketing';
import { buildCatalog } from './generators/catalog';
import { type Ctx, makeCtx, staffEmail } from './generators/context';
import { buildCore } from './generators/core';
import { buildCustomers, emitCustomerRows } from './generators/customers';
import { emitCatalogRows } from './generators/emit-catalog';
import { emitCommerceRows } from './generators/emit-commerce';
import { buildInventory } from './generators/inventory';
import { buildOrders } from './generators/orders';
import type { DatasetOptions, TenantDataset, TenantSpec } from './types';

/**
 * Builds one tenant's complete dataset in memory. Pure and deterministic: the same spec, seed and
 * as-of date always produce the same rows, identities and timestamps.
 */
export function buildTenantDataset(spec: TenantSpec, opts: DatasetOptions): TenantDataset {
  const problems = validateSpec(spec);
  if (problems.length > 0) throw new Error(`Invalid tenant specification:\n  ${problems.join('\n  ')}`);

  const ctx: Ctx = makeCtx(spec, opts);
  const core = buildCore(ctx);
  const catalog = buildCatalog(ctx, core);
  const customers = buildCustomers(ctx, core);
  const { orders, coupons } = buildOrders(ctx, core, catalog, customers);
  const inventory = buildInventory(ctx, core, catalog, orders);
  finalizeCommerce(ctx, orders, coupons, customers, catalog);
  emitCatalogRows(ctx, catalog);
  emitCustomerRows(ctx, customers);
  emitCommerceRows(ctx, core, orders, inventory);

  if (catalog.products.length !== TARGETS.products) ctx.warnings.push(`Product count ${catalog.products.length} != ${TARGETS.products}`);
  if (customers.length !== TARGETS.customers) ctx.warnings.push(`Customer count ${customers.length} != ${TARGETS.customers}`);
  if (orders.length !== TARGETS.orders) ctx.warnings.push(`Order count ${orders.length} != ${TARGETS.orders}`);

  const created = ctx.tenantCreatedAt;
  const tenant = {
    nk: spec.slug,
    ts: created,
    updatedAt: ctx.now,
    v: {
      slug: spec.slug,
      business_name: spec.businessName,
      storefront_theme: spec.storefrontTheme,
      allowed_storefront_themes: ['default', ...(spec.storefrontTheme === 'default' ? [] : [spec.storefrontTheme])],
      legal_name: spec.legalName,
      owner_user_id: null,
      current_subscription_id: null,
      status: 'ACTIVE',
      provisioning_step: 'COMPLETED',
      country_code: 'IN',
      default_currency: 'INR',
      default_locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      tax_registration: spec.gstin,
      contact_email: staffEmail(spec, 'owner'),
      contact_phone: spec.contactPhone,
      trial_ends_at: null,
      suspended_at: null,
      suspension_reason: null,
      onboarding_state: { completed: true, source: 'realistic-seed' },
      version: 0,
    },
  };

  const statusCounts: Record<string, number> = {};
  const paymentMethodCounts: Record<string, number> = {};
  let revenue = 0;
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    paymentMethodCounts[o.method] = (paymentMethodCounts[o.method] ?? 0) + 1;
    if (COUNTED_STATUSES.has(o.status)) revenue += o.totalMinor - o.amountRefundedMinor;
  }
  const gstSlabCounts: Record<string, number> = {};
  for (const p of catalog.products) gstSlabCounts[`GST-${p.gst}`] = (gstSlabCounts[`GST-${p.gst}`] ?? 0) + 1;

  return {
    slug: spec.slug,
    businessName: spec.businessName,
    hostname: core.hostname,
    tenant,
    rows: ctx.sink.rows,
    summary: {
      slug: spec.slug,
      products: catalog.products.length,
      variants: catalog.products.reduce((s, p) => s + p.variants.length, 0),
      customers: customers.length,
      orders: orders.length,
      statusCounts,
      paymentMethodCounts,
      gstSlabCounts,
      inventoryArchetypes: inventory.archetypeCounts,
      revenueMinor: String(revenue),
      firstOrderAt: orders[0]?.createdAt.toISOString() ?? null,
      lastOrderAt: orders[orders.length - 1]?.createdAt.toISOString() ?? null,
    },
    logins: core.staff.map((s) => ({ email: s.email, name: `${s.first} ${s.last}`, roles: s.roles })),
    giftCardCodes: ctx.giftCardCodes,
    couponCodes: coupons.filter((c) => (c.spec.status ?? 'ACTIVE') === 'ACTIVE').map((c) => c.code),
    warnings: ctx.warnings,
  };
}
