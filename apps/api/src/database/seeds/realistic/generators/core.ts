import { addMs, MS_HOUR } from '../dates';
import { hexFrom } from '../rng';
import type { Row } from '../types';
import { Ref } from '../types';
import { type Ctx, placeholderImage, STAFF_PASSWORD_PLACEHOLDER, staffEmail } from './context';

export interface StaffModel {
  key: string;
  email: string;
  emailNormalized: string;
  first: string;
  last: string;
  roles: string[];
}

export interface CoreModel {
  hostname: string;
  homeStateCode: string;
  warehouses: { code: string; priority: number; stateCode: string; city: string; postal: string; model: Ctx['spec']['warehouses'][number] }[];
  staff: StaffModel[];
  /** GST slabs in use -> tax class code. */
  taxClassBySlab: Map<number, string>;
  logoUrl: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tenant-level rows: domain, store, warehouses, staff users and role grants, GST tax classes and
 * rates, a published storefront theme, and the order-number sequence.
 */
export function buildCore(ctx: Ctx): CoreModel {
  const { spec, opts, sink } = ctx;
  const hostname = `${spec.slug}.${opts.rootDomain}`;
  const primary = spec.warehouses[0]!;
  const homeStateCode = primary.stateCode;
  const created = ctx.tenantCreatedAt;
  const logoUrl = placeholderImage(400, 120, spec.brandColor, 'ffffff', spec.businessName);

  // --- tenants (global table; row kept on the dataset, not in the sink) -------------------
  // Built by dataset.ts so that it can carry the owner back-link; see buildTenantRow below.

  // --- store ----------------------------------------------------------------------------
  const storeNk = `${spec.slug}-store`;
  sink.add('stores', {
    nk: storeNk,
    ts: addMs(created, 5 * MS_HOUR),
    v: {
      name: spec.storeName,
      slug: storeNk,
      status: 'ACTIVE',
      currency: 'INR',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      weight_unit: 'kg',
      dimension_unit: 'cm',
      active_theme_id: null,
      logo_url: logoUrl,
      favicon_url: placeholderImage(64, 64, spec.brandColor, 'ffffff', spec.businessName.slice(0, 2)),
      support_email: `support@${spec.slug}.test`,
      support_phone: spec.supportPhone,
      business_address: {
        recipientName: spec.legalName,
        addressLine1: primary.line1,
        city: primary.city,
        stateCode: primary.stateCode,
        stateName: primary.state,
        postalCode: primary.postal,
        countryCode: 'IN',
        gstin: spec.gstin,
      },
      is_marketplace_supplier: 0,
      is_marketplace_reseller: 0,
    },
  });
  const storeRef = new Ref('stores', storeNk);

  // --- domain ---------------------------------------------------------------------------
  sink.add('tenant_domains', {
    nk: hostname,
    ts: addMs(created, 6 * MS_HOUR),
    v: {
      store_id: storeRef,
      hostname,
      type: 'SUBDOMAIN',
      is_primary: 1,
      verification_token: null,
      verification_method: null,
      verified_at: addMs(created, 6 * MS_HOUR),
      ssl_status: 'NONE',
      ssl_issued_at: null,
      ssl_expires_at: null,
      last_check_at: null,
      check_attempts: 0,
      last_error: null,
    },
  });

  // --- warehouses -----------------------------------------------------------------------
  const warehouses = spec.warehouses.map((w, index) => {
    sink.add('warehouses', {
      nk: w.code,
      ts: addMs(created, (7 + index) * MS_HOUR),
      v: {
        store_id: storeRef,
        code: w.code,
        name: w.name,
        type: 'WAREHOUSE',
        address_line1: w.line1,
        address_line2: null,
        city: w.city,
        state_code: w.stateCode,
        postal_code: w.postal,
        country_code: 'IN',
        latitude: w.lat,
        longitude: w.lng,
        priority: index,
        is_default: index === 0 ? 1 : 0,
        is_active: 1,
      },
    });
    return { code: w.code, priority: index, stateCode: w.stateCode, city: w.city, postal: w.postal, model: w };
  });

  // --- staff users and role grants --------------------------------------------------------
  const staff: StaffModel[] = spec.staff.map((s) => {
    const email = staffEmail(spec, s.key);
    return { key: s.key, email, emailNormalized: normalizeEmail(email), first: s.first, last: s.last, roles: s.roles };
  });
  staff.forEach((s, index) => {
    const rng = ctx.rng('staff', s.key);
    const at = addMs(created, (8 + index) * MS_HOUR);
    sink.add('users', {
      nk: s.emailNormalized,
      ts: at,
      v: {
        user_type: 'TENANT',
        email: s.email,
        email_normalized: s.emailNormalized,
        phone_e164: null,
        password_hash: STAFF_PASSWORD_PLACEHOLDER,
        password_algo: 'bcrypt',
        password_changed_at: at,
        first_name: s.first,
        last_name: s.last,
        avatar_url: null,
        status: 'ACTIVE',
        email_verified_at: at,
        phone_verified_at: null,
        mfa_enabled: 0,
        failed_login_attempts: 0,
        last_login_at: addMs(ctx.now, -rng.int(2, 60) * MS_HOUR),
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
      },
    });
    for (const role of s.roles) {
      sink.add('user_roles', {
        nk: `${s.emailNormalized}|${role}`,
        ts: at,
        v: {
          user_id: new Ref('users', s.emailNormalized),
          role_id: new Ref('roles', role),
          store_id: null,
          granted_by: null,
          granted_at: at,
          expires_at: null,
        },
      });
    }
  });

  // --- tax classes and rates (GST slabs actually used by this tenant's catalog) ----------
  const slabs = [...new Set(spec.families.map((f) => f.gst))].sort((a, b) => a - b);
  const taxClassBySlab = new Map<number, string>();
  const defaultSlab = slabs.includes(18) ? 18 : slabs[0]!;
  for (const slab of slabs) {
    const code = `GST-${slab}`;
    taxClassBySlab.set(slab, code);
    const at = addMs(created, 9 * MS_HOUR);
    sink.add('tax_classes', { nk: code, ts: at, v: { code, name: `GST ${slab}%`, is_default: slab === defaultSlab ? 1 : 0 } });
    const rate = `${slab}.0000`;
    const half = slab / 2;
    const effectiveFrom = '2017-07-01';
    // Intra-state: CGST + SGST. The calculator prefers the state-specific row, so this one wins when
    // the ship-to state matches the tenant's home state.
    sink.add('tax_rates', {
      nk: `${code}|${homeStateCode}`,
      ts: at,
      v: {
        tax_class_id: new Ref('tax_classes', code),
        name: slab === 0 ? 'GST 0%' : `CGST ${half}% + SGST ${half}%`,
        country_code: 'IN',
        state_code: homeStateCode,
        postal_pattern: null,
        rate,
        compound: 0,
        priority: 10,
        is_inclusive: 0,
        components: slab === 0 ? null : [{ name: 'CGST', rate: half }, { name: 'SGST', rate: half }],
        effective_from: effectiveFrom,
        effective_to: null,
      },
    });
    // Inter-state: IGST for every other ship-to state.
    sink.add('tax_rates', {
      nk: `${code}|*`,
      ts: at,
      v: {
        tax_class_id: new Ref('tax_classes', code),
        name: slab === 0 ? 'GST 0%' : `IGST ${slab}%`,
        country_code: 'IN',
        state_code: null,
        postal_pattern: null,
        rate,
        compound: 0,
        priority: 0,
        is_inclusive: 0,
        components: slab === 0 ? null : [{ name: 'IGST', rate: slab }],
        effective_from: effectiveFrom,
        effective_to: null,
      },
    });
  }

  // --- published storefront theme (cloned from the platform template when it exists) -----
  const themeConfig = {
    brandColor: `#${spec.brandColor}`,
    accentColor: `#${spec.accentColor}`,
    logoUrl,
    tagline: spec.tagline,
    storefrontTheme: spec.storefrontTheme,
  };
  const themeRow: Row = {
    nk: 'published',
    ts: addMs(created, 12 * MS_HOUR),
    optional: true,
    v: {
      store_id: storeRef,
      template_id: new Ref('theme_templates', spec.themeTemplate),
      name: `${spec.businessName} theme`,
      config: themeConfig,
      custom_css: null,
      custom_head_html: null,
      status: 'PUBLISHED',
      published_at: addMs(created, 12 * MS_HOUR),
      published_config: themeConfig,
    },
  };
  sink.add('tenant_themes', themeRow);

  // --- banners ----------------------------------------------------------------------------
  spec.banners.forEach((b, index) => {
    sink.add('banners', {
      nk: `HOME_HERO|${index + 1}`,
      ts: addMs(created, (14 + index) * MS_HOUR),
      v: {
        store_id: storeRef,
        placement: 'HOME_HERO',
        title: b.title,
        subtitle: b.subtitle,
        image_url: placeholderImage(1600, 560, spec.brandColor, 'ffffff', b.title),
        mobile_image_url: placeholderImage(800, 600, spec.brandColor, 'ffffff', b.title),
        alt_text: b.title,
        link_url: b.link,
        cta_label: b.cta,
        sort_order: index + 1,
        starts_at: null,
        ends_at: null,
        is_active: 1,
        click_count: 40 + hexFrom(`${spec.slug}|banner|${index}`, 2).charCodeAt(0) * 3,
      },
    });
  });
  sink.add('banners', {
    nk: 'HOME_STRIP|1',
    ts: addMs(created, 18 * MS_HOUR),
    v: {
      store_id: storeRef,
      placement: 'HOME_STRIP',
      title: `Free delivery above Rs ${spec.freeShippingRupees}`,
      subtitle: 'Pan-India delivery with cash on delivery available',
      image_url: placeholderImage(1600, 160, spec.accentColor, 'ffffff', 'Free delivery'),
      mobile_image_url: null,
      alt_text: 'Free delivery',
      link_url: '/products',
      cta_label: 'Shop now',
      sort_order: 1,
      starts_at: null,
      ends_at: null,
      is_active: 1,
      click_count: 12,
    },
  });

  return { hostname, homeStateCode, warehouses, staff, taxClassBySlab, logoUrl };
}
