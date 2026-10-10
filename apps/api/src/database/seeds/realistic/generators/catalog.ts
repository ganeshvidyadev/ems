import { createHash } from 'node:crypto';
import { slugify } from '@ems/kernel';
import { addMs, MS_DAY, MS_HOUR } from '../dates';
import { hexFrom, type Rng } from '../rng';
import type { FamilySpec, VariantAxis } from '../types';
import { Ref } from '../types';
import { type Ctx, placeholderImage, rupeesToMinor } from './context';
import type { CoreModel } from './core';

export interface VariantModel {
  sku: string;
  title: string;
  optionValues: Record<string, string>;
  priceMinor: number;
  compareMinor: number | null;
  costMinor: number;
  weightG: number;
  position: number;
}

export type Archetype = 'healthy' | 'low' | 'oos';

export interface ProductModel {
  index: number;
  slug: string;
  sku: string | null;
  name: string;
  brandSlug: string;
  brandName: string;
  family: FamilySpec;
  leaf: string;
  also: string | null;
  type: 'SIMPLE' | 'VARIABLE';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  priceMinor: number;
  compareMinor: number | null;
  costMinor: number;
  gst: number;
  hsn: string;
  taxClassCode: string;
  weightG: number;
  createdAt: Date;
  variants: VariantModel[];
  popularity: number;
  lowStockThreshold: number;
  archetype: Archetype;
  openingStock: number;
  reorderQty: number;
  secondaryOnly: boolean;
  hasSecondary: boolean;
  specs: Record<string, string>;
  imageUrls: string[];
  featured: boolean;
  barcode: string;
  // Aggregates filled once orders exist.
  totalSold: number;
  ratingSum: number;
  ratingCount: number;
}

export interface CatalogModel {
  products: ProductModel[];
  bySlug: Map<string, ProductModel>;
  categoryNames: Map<string, string>;
  categoryParent: Map<string, string | null>;
}

/** Mirrors `computeOptionSignature` in the variant service: SHA-256 of the entries sorted by key. */
export function optionSignature(optionValues: Record<string, string>): string {
  const sorted = Object.keys(optionValues)
    .sort()
    .map((key) => [key, optionValues[key]] as const);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function roundEnding(rupees: number, ending: FamilySpec['ending']): number {
  let value: number;
  switch (ending) {
    case 99: {
      const step = rupees < 200 ? 10 : rupees < 1000 ? 50 : rupees < 10000 ? 100 : 500;
      value = Math.max(1, Math.round(rupees / step)) * step - 1;
      break;
    }
    case 9:
      value = Math.max(1, Math.round(rupees / 10)) * 10 - 1;
      break;
    case 0:
      value = Math.max(10, Math.round(rupees / 10) * 10);
      break;
    case 5:
      value = Math.max(5, Math.round(rupees / 5) * 5);
      break;
    default:
      value = Math.max(1, Math.round(rupees));
  }
  return Math.max(1, value);
}

function priceStep(rupees: number, ending: FamilySpec['ending']): number {
  if (ending === 99) return rupees < 200 ? 10 : rupees < 1000 ? 50 : rupees < 10000 ? 100 : 500;
  return ending === 1 ? 1 : 10;
}

interface ModelEntry {
  model: string;
  lo: number;
  hi: number;
}

function parseModels(family: FamilySpec): ModelEntry[] {
  return family.models.map((raw) => {
    const [name, hint] = raw.split('|');
    if (hint) {
      const [lo, hi] = hint.split('-').map(Number);
      return { model: name!, lo: lo!, hi: hi! };
    }
    return { model: name!, lo: family.price[0], hi: family.price[1] };
  });
}

export function ean13(seed: string): string {
  const digits = `890${BigInt('0x' + hexFrom(seed, 12)).toString().padStart(15, '0').slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return digits + String((10 - (sum % 10)) % 10);
}

function crossProduct(axes: VariantAxis[]): { axis: VariantAxis; value: VariantAxis['values'][number] }[][] {
  let combos: { axis: VariantAxis; value: VariantAxis['values'][number] }[][] = [[]];
  for (const axis of axes) {
    const next: typeof combos = [];
    for (const combo of combos) for (const value of axis.values) next.push([...combo, { axis, value }]);
    combos = next;
  }
  return combos;
}

function makeVariants(rng: Rng, family: FamilySpec, baseSku: string, basePriceRupees: number, compareRatio: number | null, costRatio: number, baseWeight: number): VariantModel[] {
  const axes = family.axes ?? [];
  const combos = crossProduct(axes);
  const max = Math.min(family.maxVariants ?? combos.length, combos.length);
  const target = Math.min(combos.length, rng.int(Math.min(3, max), max));
  const chosen = combos.length <= target ? combos : rng.shuffle(combos).slice(0, target);
  // Keep the natural option order so the cheapest option first.
  chosen.sort((a, b) => combos.indexOf(a) - combos.indexOf(b));

  const variants: VariantModel[] = [];
  const usedCodes = new Set<string>();
  chosen.forEach((combo, position) => {
    let mult = 1;
    let deltaRupees = 0;
    let weightMult = 1;
    const optionValues: Record<string, string> = {};
    const codes: string[] = [];
    for (const { axis, value } of combo) {
      optionValues[axis.name] = value.label;
      mult *= value.priceMult ?? 1;
      deltaRupees += value.priceDelta ?? 0;
      if (axis.name === 'Pack size') weightMult *= value.priceMult ?? 1;
      codes.push(value.code);
    }
    let sku = `${baseSku}-${codes.join('-')}`;
    if (usedCodes.has(sku)) sku = `${sku}-${position + 1}`;
    usedCodes.add(sku);
    const rupees = roundEnding(basePriceRupees * mult + deltaRupees, family.ending);
    const priceMinor = rupeesToMinor(rupees);
    let compareMinor: number | null = null;
    if (compareRatio) {
      const compareRupees = roundEnding(rupees * compareRatio, family.ending);
      compareMinor = rupeesToMinor(Math.max(compareRupees, rupees + priceStep(rupees, family.ending)));
    }
    variants.push({
      sku,
      title: combo.map((c) => c.value.label).join(' / '),
      optionValues,
      priceMinor,
      compareMinor,
      costMinor: Math.round(priceMinor * costRatio),
      weightG: Math.max(1, Math.round(baseWeight * weightMult)),
      position,
    });
  });
  // The product's own price is the cheapest variant; keep that variant first.
  variants.sort((a, b) => a.priceMinor - b.priceMinor || a.position - b.position);
  variants.forEach((v, i) => {
    v.position = i;
  });
  return variants;
}

/** Builds every product (and variant) in memory. Pure: same inputs, same catalog. */
export function buildCatalog(ctx: Ctx, core: CoreModel): CatalogModel {
  const { spec } = ctx;
  const brandName = new Map(spec.brands.map((b) => [b.slug, b.name] as const));
  const categoryNames = new Map<string, string>();
  const categoryParent = new Map<string, string | null>();
  for (const cat of spec.categories) {
    categoryNames.set(cat.slug, cat.name);
    categoryParent.set(cat.slug, null);
    for (const child of cat.children ?? []) {
      categoryNames.set(child.slug, child.name);
      categoryParent.set(child.slug, cat.slug);
    }
  }

  const products: ProductModel[] = [];
  const usedSlugs = new Set<string>();
  let index = 0;

  for (const family of spec.families) {
    const entries = parseModels(family);
    // brand x model combinations, shuffled deterministically, first `count` taken.
    const combos: { brand: string; entry: ModelEntry; modelIndex: number }[] = [];
    for (const brand of family.brands) entries.forEach((entry, modelIndex) => combos.push({ brand, entry, modelIndex }));
    const famRng = ctx.rng('family', family.id);
    const picked = famRng.shuffle(combos).slice(0, family.count);
    // Order by model so the listing reads naturally; this also fixes the SKU sequence.
    picked.sort((a, b) => a.modelIndex - b.modelIndex || a.brand.localeCompare(b.brand));

    picked.forEach((combo, famIndex) => {
      index += 1;
      const rng = ctx.rng('product', index);
      const name = `${brandName.get(combo.brand)} ${combo.entry.model}`;
      let slug = slugify(name, 480);
      if (usedSlugs.has(slug)) slug = `${slug}-${famIndex + 1}`;
      usedSlugs.add(slug);

      const seq = String(famIndex + 1).padStart(4, '0');
      const baseSku = `${spec.tag}-${family.id}-${seq}`;

      // Price: geometric within the model's band; weight scales with the same tier.
      const tier = rng.float();
      const priceRupees = roundEnding(combo.entry.lo * Math.pow(combo.entry.hi / combo.entry.lo, tier), family.ending);
      const bandLo = family.price[0];
      const bandHi = Math.max(family.price[1], bandLo + 1);
      const weightTier = Math.min(1, Math.max(0, Math.log(Math.max(priceRupees, bandLo) / bandLo) / Math.log(bandHi / bandLo)));
      const weightG = Math.max(1, Math.round(family.weightG[0] * Math.pow(family.weightG[1] / family.weightG[0], weightTier)));

      const hasCompare = rng.chance(0.3);
      const compareRatio = hasCompare ? 1 + rng.int(10, 45) / 100 : null;
      const costRatio = 0.55 + rng.float() * 0.3;

      let variants: VariantModel[] = [];
      let priceMinor: number;
      let compareMinor: number | null = null;
      if (family.type === 'VARIABLE') {
        variants = makeVariants(rng, family, baseSku, priceRupees, compareRatio, costRatio, weightG);
        priceMinor = variants[0]!.priceMinor;
        compareMinor = variants[0]!.compareMinor;
      } else {
        priceMinor = rupeesToMinor(priceRupees);
        if (compareRatio) {
          const compareRupees = roundEnding(priceRupees * compareRatio, family.ending);
          compareMinor = rupeesToMinor(Math.max(compareRupees, priceRupees + priceStep(priceRupees, family.ending)));
        }
      }

      const specs: Record<string, string> = {};
      for (const [key, values] of Object.entries(family.specs)) specs[key] = rng.pick(values);

      const popularity = family.popularity * Math.exp(rng.gauss() * 0.55);
      const opening = rng.int(family.stock[0], family.stock[1]);
      const createdAt = addMs(ctx.tenantCreatedAt, (2 + (index % 24)) * MS_DAY + rng.int(0, 20) * MS_HOUR);
      const imageCount = rng.int(2, 4);
      const imageUrls: string[] = [];
      for (let n = 0; n < imageCount; n += 1) {
        const label = n === 0 ? name : `${name} view ${n + 1}`;
        imageUrls.push(placeholderImage(800, 800, family.palette[0], family.palette[1], label));
      }

      products.push({
        index,
        slug,
        sku: family.type === 'VARIABLE' ? null : baseSku,
        name,
        brandSlug: combo.brand,
        brandName: brandName.get(combo.brand) ?? combo.brand,
        family,
        leaf: family.category,
        also: family.alsoIn ?? null,
        type: family.type,
        status: 'ACTIVE',
        priceMinor,
        compareMinor,
        costMinor: Math.round(priceMinor * costRatio),
        gst: family.gst,
        hsn: family.hsn,
        taxClassCode: core.taxClassBySlab.get(family.gst) ?? 'GST-18',
        weightG,
        createdAt,
        variants,
        popularity,
        lowStockThreshold: Math.max(3, Math.round(opening * 0.18)),
        archetype: 'healthy',
        openingStock: opening,
        reorderQty: Math.max(10, Math.round(opening * 0.9)),
        secondaryOnly: false,
        hasSecondary: false,
        specs,
        imageUrls,
        featured: false,
        barcode: ean13(`${spec.slug}|${slug}`),
        totalSold: 0,
        ratingSum: 0,
        ratingCount: 0,
      });
    });
  }

  // Lifecycle status: a few drafts and archived products, chosen among the least popular.
  const statusRng = ctx.rng('status');
  const byPopularity = [...products].sort((a, b) => a.popularity - b.popularity);
  const lowTail = byPopularity.slice(0, 40);
  const shuffledTail = statusRng.shuffle(lowTail);
  shuffledTail.slice(0, 4).forEach((p) => (p.status = 'DRAFT'));
  shuffledTail.slice(4, 7).forEach((p) => (p.status = 'ARCHIVED'));

  // Featured: the most popular ~8%.
  [...products]
    .filter((p) => p.status === 'ACTIVE')
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, Math.round(products.length * 0.08))
    .forEach((p) => (p.featured = true));

  // Inventory archetypes among ACTIVE products that are not the best sellers.
  const archRng = ctx.rng('archetype');
  const eligible = archRng.shuffle(products.filter((p) => p.status === 'ACTIVE' && !p.featured));
  eligible.slice(0, 8).forEach((p) => (p.archetype = 'oos'));
  eligible.slice(8, 8 + 28).forEach((p) => (p.archetype = 'low'));

  // Warehouse placement: nearly everything in the primary; a few secondary-only; many split.
  const whRng = ctx.rng('warehouse-placement');
  for (const p of products) {
    const roll = whRng.float();
    if (roll < 0.06) {
      p.secondaryOnly = true;
      p.hasSecondary = true;
    } else if (roll < 0.6) {
      p.hasSecondary = true;
    }
  }

  const bySlug = new Map(products.map((p) => [p.slug, p] as const));
  return { products, bySlug, categoryNames, categoryParent };
}

/** Variant-less slot key for a SIMPLE product, or the variant SKU for a VARIABLE one. */
export function slotKey(product: ProductModel, variant: VariantModel | null): string {
  return variant ? `${product.slug}|${variant.sku}` : `${product.slug}|`;
}

export function productRef(product: ProductModel): Ref {
  return new Ref('products', product.slug);
}

export function variantRef(variant: VariantModel): Ref {
  return new Ref('product_variants', variant.sku);
}
