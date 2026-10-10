import { slugify } from '@ems/kernel';
import { addMs, MS_DAY, MS_HOUR } from '../dates';
import { hexFrom } from '../rng';
import type { Row } from '../types';
import { Ref } from '../types';
import { type CatalogModel, ean13, optionSignature, type ProductModel } from './catalog';
import { type Ctx, placeholderImage } from './context';

function productDescription(p: ProductModel): string {
  const blurb = p.family.blurb.replace('{name}', p.name);
  const specItems = Object.entries(p.specs).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`);
  const bullets = p.family.bullets.map((b) => `<li>${b}</li>`);
  return `<p>${blurb}</p><ul>${specItems.join('')}</ul><ul>${bullets.join('')}</ul>`;
}

/** Emits brand, category, attribute, product, variant, media and link rows (final aggregates included). */
export function emitCatalogRows(ctx: Ctx, catalog: CatalogModel): void {
  const { spec, sink } = ctx;
  const storeRef = new Ref('stores', `${spec.slug}-store`);
  const created = ctx.tenantCreatedAt;

  // --- brands ---------------------------------------------------------------------------
  spec.brands.forEach((b, index) => {
    sink.add('brands', {
      nk: b.slug,
      ts: addMs(created, (20 + index) * MS_HOUR),
      v: {
        name: b.name,
        slug: b.slug,
        logo_url: placeholderImage(240, 120, spec.brandColor, 'ffffff', b.name),
        description: b.description,
        meta_title: `${b.name} | ${spec.businessName}`,
        meta_description: b.description,
        is_active: 1,
      },
    });
  });

  // --- categories (product_count rolled up from the linked ACTIVE products) -------------------
  const directCounts = new Map<string, number>();
  for (const p of catalog.products) {
    if (p.status !== 'ACTIVE') continue;
    for (const slug of [p.leaf, p.also]) {
      if (slug) directCounts.set(slug, (directCounts.get(slug) ?? 0) + 1);
    }
  }
  const rollup = new Map<string, number>();
  for (const [slug, parent] of catalog.categoryParent) {
    const own = directCounts.get(slug) ?? 0;
    rollup.set(slug, (rollup.get(slug) ?? 0) + own);
    if (parent) rollup.set(parent, (rollup.get(parent) ?? 0) + own);
  }
  let sortOrder = 0;
  for (const cat of spec.categories) {
    sortOrder += 1;
    const topAt = addMs(created, (30 + sortOrder) * MS_HOUR);
    sink.add('categories', {
      nk: cat.slug,
      ts: topAt,
      v: {
        store_id: storeRef,
        parent_id: null,
        name: cat.name,
        slug: cat.slug,
        path: '/pending/',
        depth: 0,
        description: cat.description,
        image_url: placeholderImage(800, 600, spec.brandColor, 'ffffff', cat.name),
        banner_url: null,
        sort_order: sortOrder,
        product_count: rollup.get(cat.slug) ?? 0,
        meta_title: `${cat.name} | ${spec.businessName}`,
        meta_description: cat.description,
        is_active: 1,
        show_in_menu: 1,
      },
    });
    (cat.children ?? []).forEach((child, childIndex) => {
      sink.add('categories', {
        nk: child.slug,
        ts: addMs(topAt, (childIndex + 1) * MS_HOUR),
        v: {
          store_id: storeRef,
          parent_id: new Ref('categories', cat.slug),
          name: child.name,
          slug: child.slug,
          path: '/pending/',
          depth: 1,
          description: child.description,
          image_url: placeholderImage(800, 600, spec.accentColor, 'ffffff', child.name),
          banner_url: null,
          sort_order: childIndex + 1,
          product_count: rollup.get(child.slug) ?? 0,
          meta_title: `${child.name} | ${spec.businessName}`,
          meta_description: child.description,
          is_active: 1,
          show_in_menu: 1,
        },
      });
    });
  }

  // --- attribute registry (variant options and faceted specs) -------------------------------
  const attrCode = (name: string): string => slugify(name, 60);
  const attributes = new Map<string, { name: string; variantOption: boolean; type: string }>();
  for (const family of spec.families) {
    for (const axis of family.axes ?? []) {
      attributes.set(attrCode(axis.name), { name: axis.name, variantOption: true, type: axis.name === 'Colour' ? 'COLOR' : 'SELECT' });
    }
    for (const facet of family.facets) {
      if (!attributes.has(attrCode(facet))) attributes.set(attrCode(facet), { name: facet, variantOption: false, type: 'SELECT' });
    }
  }
  let attrOrder = 0;
  for (const [code, attr] of attributes) {
    attrOrder += 1;
    sink.add('product_attributes', {
      nk: code,
      ts: addMs(created, (40 + attrOrder) * MS_HOUR),
      v: {
        code,
        name: attr.name,
        input_type: attr.type,
        is_variant_option: attr.variantOption ? 1 : 0,
        is_filterable: 1,
        sort_order: attrOrder,
      },
    });
  }

  // --- products and children -----------------------------------------------------------------
  for (const p of catalog.products) {
    const storeAt = p.createdAt;
    const published = p.status === 'ACTIVE' ? addMs(storeAt, 3 * MS_HOUR) : null;
    const rating = p.ratingCount > 0 ? (p.ratingSum / p.ratingCount).toFixed(2) : '0.00';
    const catNames = [catalog.categoryNames.get(p.leaf), p.also ? catalog.categoryNames.get(p.also) : undefined].filter(Boolean);
    const row: Row = {
      nk: p.slug,
      ts: storeAt,
      updatedAt: addMs(storeAt, 2 * MS_DAY),
      v: {
        store_id: storeRef,
        brand_id: new Ref('brands', p.brandSlug),
        tax_class_id: new Ref('tax_classes', p.taxClassCode),
        type: p.type,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        short_description: p.family.blurb.replace('{name}', p.name).slice(0, 300),
        description: productDescription(p),
        status: p.status,
        visibility: p.status === 'ARCHIVED' ? 'HIDDEN' : 'VISIBLE',
        price_minor: p.priceMinor,
        compare_price_minor: p.compareMinor,
        cost_price_minor: p.costMinor,
        currency: 'INR',
        track_inventory: 1,
        allow_backorder: 0,
        low_stock_threshold: p.lowStockThreshold,
        weight_grams: p.weightG,
        length_mm: p.family.dimsMm?.[0] ?? null,
        width_mm: p.family.dimsMm?.[1] ?? null,
        height_mm: p.family.dimsMm?.[2] ?? null,
        barcode: p.type === 'SIMPLE' ? p.barcode : null,
        hsn_code: p.hsn,
        requires_shipping: 1,
        is_featured: p.featured ? 1 : 0,
        is_shareable: 0,
        meta_title: `${p.name} | ${spec.businessName}`.slice(0, 250),
        meta_description: p.family.blurb.replace('{name}', p.name).slice(0, 300),
        meta_keywords: [p.brandName, ...catNames, p.family.id].join(', ').slice(0, 450),
        attributes: { brand: p.brandName, ...p.specs },
        rating_average: rating,
        rating_count: p.ratingCount,
        total_sold: p.totalSold,
        published_at: published,
        version: 0,
        created_by: null,
      },
    };
    sink.add('products', row);

    p.variants.forEach((v) => {
      sink.add('product_variants', {
        nk: v.sku,
        ts: storeAt,
        v: {
          product_id: new Ref('products', p.slug),
          sku: v.sku,
          barcode: ean13(`${spec.slug}|${v.sku}`),
          title: v.title,
          option_values: v.optionValues,
          option_signature: optionSignature(v.optionValues),
          price_minor: v.priceMinor,
          compare_price_minor: v.compareMinor,
          cost_price_minor: v.costMinor,
          weight_grams: v.weightG,
          image_id: null,
          position: v.position,
          is_active: 1,
        },
      });
    });

    p.imageUrls.forEach((url, position) => {
      sink.add('product_media', {
        nk: `${p.slug}|${position}`,
        ts: storeAt,
        v: {
          product_id: new Ref('products', p.slug),
          variant_id: null,
          type: 'IMAGE',
          url,
          storage_key: `seed/${spec.slug}/${p.slug}/${position + 1}.png`,
          thumbnail_url: url.replace('/800x800/', '/200x200/'),
          alt_text: position === 0 ? p.name : `${p.name} view ${position + 1}`,
          mime_type: 'image/png',
          size_bytes: 18_000 + (hexFrom(`${p.slug}|${position}`, 4).charCodeAt(0) % 40) * 1000,
          width: 800,
          height: 800,
          duration_sec: null,
          position,
          is_primary: position === 0 ? 1 : 0,
          status: 'READY',
        },
      });
    });

    sink.add('product_categories', {
      nk: `${p.slug}|${p.leaf}`,
      ts: storeAt,
      v: { product_id: new Ref('products', p.slug), category_id: new Ref('categories', p.leaf), is_primary: 1 },
    });
    if (p.also) {
      sink.add('product_categories', {
        nk: `${p.slug}|${p.also}`,
        ts: storeAt,
        v: { product_id: new Ref('products', p.slug), category_id: new Ref('categories', p.also), is_primary: 0 },
      });
    }

    // Faceted specs and variant options.
    for (const facet of p.family.facets) {
      const value = p.specs[facet];
      if (!value) continue;
      sink.add('product_attribute_values', {
        nk: `${p.slug}|${attrCode(facet)}|${value}`,
        ts: storeAt,
        v: {
          product_id: new Ref('products', p.slug),
          attribute_id: new Ref('product_attributes', attrCode(facet)),
          value_text: value,
          value_number: null,
          value_bool: null,
        },
      });
    }
    for (const axis of p.family.axes ?? []) {
      const labels = [...new Set(p.variants.map((v) => v.optionValues[axis.name]).filter((x): x is string => Boolean(x)))];
      labels.forEach((label) => {
        sink.add('product_attribute_values', {
          nk: `${p.slug}|${attrCode(axis.name)}|${label}`,
          ts: storeAt,
          v: {
            product_id: new Ref('products', p.slug),
            attribute_id: new Ref('product_attributes', attrCode(axis.name)),
            value_text: label,
            value_number: null,
            value_bool: null,
          },
        });
      });
    }
  }
}
