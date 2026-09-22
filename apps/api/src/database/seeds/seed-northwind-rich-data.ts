import 'reflect-metadata';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { newPublicId } from '@ems/kernel';
import dataSource from '../data-source';
import {
  TenantEntity,
  StoreEntity,
  BrandEntity,
  CategoryEntity,
  ProductEntity,
  ProductVariantEntity,
  ProductMediaEntity,
  ProductCategoryEntity,
  BannerEntity,
  CustomerEntity,
  CustomerAddressEntity,
  CouponEntity,
  GiftCardEntity,
  ReviewEntity,
  InventoryLevelEntity,
  WarehouseEntity,
} from '../entities';

export async function seedNorthwindRichData(ds: DataSource) {
  const tenantRepo = ds.getRepository(TenantEntity);
  const storeRepo = ds.getRepository(StoreEntity);
  const brandRepo = ds.getRepository(BrandEntity);
  const categoryRepo = ds.getRepository(CategoryEntity);
  const productRepo = ds.getRepository(ProductEntity);
  const variantRepo = ds.getRepository(ProductVariantEntity);
  const mediaRepo = ds.getRepository(ProductMediaEntity);
  const prodCatRepo = ds.getRepository(ProductCategoryEntity);
  const bannerRepo = ds.getRepository(BannerEntity);
  const customerRepo = ds.getRepository(CustomerEntity);
  const addressRepo = ds.getRepository(CustomerAddressEntity);
  const couponRepo = ds.getRepository(CouponEntity);
  const giftCardRepo = ds.getRepository(GiftCardEntity);
  const reviewRepo = ds.getRepository(ReviewEntity);
  const warehouseRepo = ds.getRepository(WarehouseEntity);
  const inventoryRepo = ds.getRepository(InventoryLevelEntity);

  let tenant = await tenantRepo.findOne({ where: { slug: 'northwind' } });
  if (!tenant) {
    tenant = tenantRepo.create({
      publicId: newPublicId(),
      slug: 'northwind',
      businessName: 'Northwind Traders',
      contactEmail: 'owner@northwind.test',
      status: 'ACTIVE',
      storefrontTheme: 'organic',
      allowedStorefrontThemes: ['default', 'organic', 'famms', 'circuit', 'harvest'],
      countryCode: 'IN',
      defaultCurrency: 'INR',
      defaultLocale: 'en-IN',
      timezone: 'Asia/Kolkata',
    });
    tenant = await tenantRepo.save(tenant);
  } else {
    tenant.storefrontTheme = 'organic';
    tenant.allowedStorefrontThemes = ['default', 'organic', 'famms', 'circuit', 'harvest'];
    await tenantRepo.save(tenant);
  }

  const tenantId = tenant.id;

  // 1. Store
  let store = await storeRepo.findOne({ where: { tenantId } });
  if (!store) {
    store = storeRepo.create({
      publicId: newPublicId(),
      tenantId,
      name: 'Northwind Traders - Premium Organics & Gourmet Pantry',
      slug: 'northwind-main',
      status: 'ACTIVE',
      currency: 'INR',
      logoUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
      faviconUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=64&auto=format&fit=crop&q=80',
    });
    store = await storeRepo.save(store);
  } else {
    store.name = 'Northwind Traders - Premium Organics & Gourmet Pantry';
    store.logoUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
    store.faviconUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=64&auto=format&fit=crop&q=80';
    await storeRepo.save(store);
  }
  const storeId = store.id;

  // 1.1 Warehouse
  let warehouse = await warehouseRepo.findOne({ where: { tenantId } });
  if (!warehouse) {
    warehouse = warehouseRepo.create({
      publicId: newPublicId(),
      tenantId,
      storeId,
      name: 'Mumbai Central Fulfilment Center',
      code: 'WH-MUM-01',
      addressLine1: 'Unit 402, Logistics Park, Bhiwandi',
      city: 'Thane',
      stateCode: 'MH',
      postalCode: '421302',
      countryCode: 'IN',
      isActive: true,
      isDefault: true,
    });
    warehouse = await warehouseRepo.save(warehouse);
  }

  // 2. Brands
  const brandDefs = [
    { name: 'Northwind Reserve', slug: 'northwind-reserve', description: 'Artisan handpicked single-estate specialty reserves.' },
    { name: 'Nordic Harvest', slug: 'nordic-harvest', description: 'Certified organic cold-climate botanical harvests.' },
    { name: 'Highland Estate', slug: 'highland-estate', description: 'High-elevation shade-grown coffees and whole leaf teas.' },
    { name: 'Himalayan Pure', slug: 'himalayan-pure', description: 'Raw high-altitude honey, saffron and mineral rock salts.' },
    { name: 'Valley Botanicals', slug: 'valley-botanicals', description: 'Pure cold-pressed virgin seed oils and herbal wellness remedies.' },
  ];

  const brandMap = new Map<string, string>();
  for (const b of brandDefs) {
    let brand = await brandRepo.findOne({ where: { tenantId, slug: b.slug } });
    if (!brand) {
      brand = brandRepo.create({
        publicId: newPublicId(),
        tenantId,
        name: b.name,
        slug: b.slug,
        description: b.description,
        isActive: true,
      });
      brand = await brandRepo.save(brand);
    }
    brandMap.set(b.slug, brand.id);
  }

  // 3. Categories
  const categoryDefs = [
    {
      name: 'Gourmet Coffee & Espresso',
      slug: 'gourmet-coffee',
      description: 'Single-origin specialty Arabica beans, dark roasts, and artisanal espresso blends.',
      imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Organic Herbal Teas',
      slug: 'organic-teas',
      description: 'Hand-plucked whole leaf Darjeeling, ceremonial Japanese Matcha, and soothing herbal infusions.',
      imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Artisan Honey & Spreads',
      slug: 'honey-spreads',
      description: 'Raw mountain wildflower honey, forest honeycomb, and 100% pure organic maple syrup.',
      imageUrl: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Cold-Pressed Oils & Vinegars',
      slug: 'oils-vinegars',
      description: 'First cold-pressed extra virgin olive oil, virgin avocado oil, and aged Modena balsamic vinegar.',
      imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Artisan Dry Fruits & Nuts',
      slug: 'dry-fruits-nuts',
      description: 'California jumbo roasted almonds, Saudi royal Medjool dates, and sun-dried organic figs.',
      imageUrl: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Himalayan Spices & Seasonings',
      slug: 'himalayan-spices',
      description: 'Grade-A1 Kashmiri Mongra saffron, coarse pink mountain rock salt, and whole Tellicherry peppercorn.',
      imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop&q=80',
    },
  ];

  const categoryMap = new Map<string, string>();
  for (let i = 0; i < categoryDefs.length; i++) {
    const c = categoryDefs[i]!;
    let cat = await categoryRepo.findOne({ where: { tenantId, slug: c.slug } });
    if (!cat) {
      cat = categoryRepo.create({
        publicId: newPublicId(),
        tenantId,
        storeId,
        parentId: null,
        name: c.name,
        slug: c.slug,
        path: `/${c.slug}/`,
        depth: 0,
        description: c.description,
        imageUrl: c.imageUrl,
        sortOrder: i + 1,
        isActive: true,
        productCount: 0,
      });
      cat = await categoryRepo.save(cat);
    }
    categoryMap.set(c.slug, cat.id);
  }

  // 4. Products Specification
  const productSpecs = [
    {
      name: 'Northwind Reserve Single-Origin Arabica Beans (500g)',
      slug: 'northwind-reserve-arabica-500g',
      sku: 'NW-COF-ARA-500',
      brandSlug: 'northwind-reserve',
      categorySlug: 'gourmet-coffee',
      priceMinor: '89900', // ₹899.00
      comparePriceMinor: '119900', // ₹1,199.00
      shortDescription: '100% shade-grown washed Arabica beans with notes of dark chocolate and citrus blossom.',
      description: '<p>Directly harvested from high-elevation plantations at 1,400m altitude. Freshly roasted in small batches to preserve natural aromatics, crisp acidity, and velvety body.</p><ul><li>Elevation: 1,400 meters</li><li>Roast Level: Medium-Dark</li><li>Tasting Notes: Dark Chocolate, Citrus Zest, Roasted Hazelnut</li><li>Brewing: French Press, Pour Over, Espresso</li></ul>',
      image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 500,
    },
    {
      name: 'Ceremonial Grade Uji Matcha Green Tea Powder (100g)',
      slug: 'ceremonial-uji-matcha-100g',
      sku: 'NW-TEA-MAT-100',
      brandSlug: 'highland-estate',
      categorySlug: 'organic-teas',
      priceMinor: '149900', // ₹1,499.00
      comparePriceMinor: '189900', // ₹1,899.00
      shortDescription: 'First-harvest stone-ground Japanese Uji matcha with vibrant green hue and rich umami.',
      description: '<p>Sourced directly from certified heritage tea gardens in Uji, Kyoto. Handpicked shade-grown tencha leaves stone-ground to micro-fine powder for authentic Japanese tea ceremonies and antioxidant-packed daily lattes.</p>',
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 100,
    },
    {
      name: 'Pure Himalayan Raw Wildflower Honey (500g)',
      slug: 'himalayan-raw-wildflower-honey-500g',
      sku: 'NW-HNY-WLD-500',
      brandSlug: 'himalayan-pure',
      categorySlug: 'honey-spreads',
      priceMinor: '65000', // ₹650.00
      comparePriceMinor: '79900', // ₹799.00
      shortDescription: 'Unfiltered, unpasteurized natural forest honey rich in active enzymes, pollen and antioxidants.',
      description: '<p>Collected by traditional tribal beekeepers from pristine Himalayan flora. Naturally crystallized and unprocessed to preserve the wholesome therapeutic enzymes, vitamins, and minerals.</p>',
      image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 500,
    },
    {
      name: 'Single-Estate Extra Virgin Olive Oil First Cold Press (750ml)',
      slug: 'single-estate-extra-virgin-olive-oil-750ml',
      sku: 'NW-OIL-EVO-750',
      brandSlug: 'valley-botanicals',
      categorySlug: 'oils-vinegars',
      priceMinor: '129900', // ₹1,299.00
      comparePriceMinor: '159900', // ₹1,599.00
      shortDescription: 'Acidity below 0.2% with intense peppery finish, fresh grassy aroma and high polyphenol count.',
      description: '<p>Extracted mechanically within 4 hours of harvest using stone mills. Perfect for finishing salads, bruschetta, grilled vegetables, and artisanal sourdough dips.</p>',
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 750,
    },
    {
      name: 'Organic Darjeeling First Flush Black Tea Wooden Gift Box (150g)',
      slug: 'darjeeling-first-flush-black-tea-150g',
      sku: 'NW-TEA-DAR-150',
      brandSlug: 'highland-estate',
      categorySlug: 'organic-teas',
      priceMinor: '99900', // ₹999.00
      comparePriceMinor: '125000', // ₹1,250.00
      shortDescription: 'Known as the Champagne of Teas. Delicate floral muscatel bouquet harvested in early spring.',
      description: '<p>Harvested from century-old tea bushes on mist-clad slopes of Darjeeling. Packed in handcrafted pine-wood gift boxes to preserve supreme freshness.</p>',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 150,
    },
    {
      name: 'Kashmiri Mongra Grade-A1 Saffron Kesar (5g)',
      slug: 'kashmiri-mongra-grade-a1-saffron-5g',
      sku: 'NW-SPC-SAF-005',
      brandSlug: 'himalayan-pure',
      categorySlug: 'himalayan-spices',
      priceMinor: '185000', // ₹1,850.00
      comparePriceMinor: '220000', // ₹2,200.00
      shortDescription: '100% pure thick red stigmas with extraordinary natural aroma, coloring strength and potency.',
      description: '<p>Authentic Pampore saffron harvested by hand. Free from artificial colorants, additives or broken threads. Certified Grade A1 with exceptional crocin concentration.</p>',
      image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 5,
    },
    {
      name: 'California Jumbo Roasted & Sea-Salted Almonds (500g)',
      slug: 'california-jumbo-roasted-almonds-500g',
      sku: 'NW-NUT-ALM-500',
      brandSlug: 'nordic-harvest',
      categorySlug: 'dry-fruits-nuts',
      priceMinor: '59900', // ₹599.00
      comparePriceMinor: '75000', // ₹750.00
      shortDescription: 'Slow-roasted in small batches and gently tossed with pink rock salt for supreme crunch.',
      description: '<p>Hand-sorted Nonpareil variety almonds. Rich in Vitamin E, dietary fiber, and healthy plant-based fats. No added oils or artificial preservatives.</p>',
      image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 500,
    },
    {
      name: 'Royal Medjool King Dates Box (500g)',
      slug: 'royal-medjool-king-dates-500g',
      sku: 'NW-NUT-DAT-500',
      brandSlug: 'nordic-harvest',
      categorySlug: 'dry-fruits-nuts',
      priceMinor: '79900', // ₹799.00
      comparePriceMinor: '99900', // ₹999.00
      shortDescription: 'Large succulent dates with caramel-like texture and rich sweetness. 100% natural superfood.',
      description: '<p>Super jumbo grade natural Medjool dates, unpitted and free from glucose syrups or sulfites. A rich source of potassium, magnesium, and natural energy.</p>',
      image: 'https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 500,
    },
    {
      name: 'Pure Cold-Pressed Virgin Avocado Oil (500ml)',
      slug: 'pure-cold-pressed-avocado-oil-500ml',
      sku: 'NW-OIL-AVO-500',
      brandSlug: 'valley-botanicals',
      categorySlug: 'oils-vinegars',
      priceMinor: '115000', // ₹1,150.00
      comparePriceMinor: '139900', // ₹1,399.00
      shortDescription: 'Emerald green unrefined avocado oil with high smoke point of 250°C and rich buttery finish.',
      description: '<p>Pressed from ripe Hass avocados. Packed with heart-healthy monounsaturated fats, lutein, and oleic acid. Excellent for high-heat cooking, grilling, and dressing.</p>',
      image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 500,
    },
    {
      name: 'Himalayan Natural Pink Rock Salt Mill Grinder (250g)',
      slug: 'himalayan-pink-rock-salt-grinder-250g',
      sku: 'NW-SPC-SLT-250',
      brandSlug: 'himalayan-pure',
      categorySlug: 'himalayan-spices',
      priceMinor: '34900', // ₹349.00
      comparePriceMinor: '45000', // ₹450.00
      shortDescription: 'Refillable ceramic mill grinder with unrefined mineral-rich coarse crystal salt.',
      description: '<p>Mined from ancient 250-million-year-old seabed deposits deep within the Himalayas. Contains over 84 trace minerals and bio-compounds without anti-caking agents.</p>',
      image: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 250,
    },
    {
      name: 'Organic Chamomile & French Lavender Calming Tea (50 Pyramid Bags)',
      slug: 'organic-chamomile-lavender-calming-tea',
      sku: 'NW-TEA-CHM-050',
      brandSlug: 'highland-estate',
      categorySlug: 'organic-teas',
      priceMinor: '69900', // ₹699.00
      comparePriceMinor: '85000', // ₹850.00
      shortDescription: 'Caffeine-free whole botanical blend for peaceful evening relaxation and restorative sleep.',
      description: '<p>Crafted from whole Egyptian chamomile blossoms and fragrant Provence lavender petals. 100% plastic-free pyramid tea bags that allow botanicals to fully expand.</p>',
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 120,
    },
    {
      name: 'Aged Modena Balsamic Vinegar IGP 12-Year Oak Cask (250ml)',
      slug: 'aged-modena-balsamic-vinegar-12yr',
      sku: 'NW-OIL-BAL-250',
      brandSlug: 'valley-botanicals',
      categorySlug: 'oils-vinegars',
      priceMinor: '169900', // ₹1,699.00
      comparePriceMinor: '210000', // ₹2,100.00
      shortDescription: 'Thick, syrupy glaze aged in sequential oak, chestnut and cherry wood barrels.',
      description: '<p>Produced in Modena, Italy from cooked Trebbiano grape must. Perfect over aged Parmesan, grilled meats, ripe strawberries, and vanilla bean gelato.</p>',
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1000&auto=format&fit=crop&q=80',
      weightGrams: 250,
    },
  ];

  for (const spec of productSpecs) {
    let prod = await productRepo.findOne({ where: { tenantId, slug: spec.slug } });
    if (!prod) {
      prod = productRepo.create({
        publicId: newPublicId(),
        tenantId,
        storeId,
        brandId: brandMap.get(spec.brandSlug) ?? null,
        taxClassId: null,
        type: 'SIMPLE',
        name: spec.name,
        slug: spec.slug,
        sku: spec.sku,
        shortDescription: spec.shortDescription,
        description: spec.description,
        status: 'ACTIVE',
        visibility: 'VISIBLE',
        priceMinor: spec.priceMinor,
        comparePriceMinor: spec.comparePriceMinor,
        costPriceMinor: String(Math.round(Number(spec.priceMinor) * 0.5)),
        currency: 'INR',
        trackInventory: true,
        allowBackorder: false,
        lowStockThreshold: 10,
      });
      prod = await productRepo.save(prod);

      // Variant
      const variant = variantRepo.create({
        publicId: newPublicId(),
        tenantId,
        productId: prod.id,
        sku: spec.sku,
        title: 'Standard Unit',
        optionValues: {},
        optionSignature: 'default',
        position: 0,
        priceMinor: spec.priceMinor,
        comparePriceMinor: spec.comparePriceMinor,
        costPriceMinor: String(Math.round(Number(spec.priceMinor) * 0.5)),
        weightGrams: spec.weightGrams,
        isActive: true,
      });
      const savedVariant = await variantRepo.save(variant);

      // Inventory
      await inventoryRepo.save(
        inventoryRepo.create({
          tenantId,
          warehouseId: warehouse.id,
          productId: prod.id,
          variantId: savedVariant.id,
          quantityOnHand: 150,
          quantityReserved: 5,
          quantityIncoming: 0,
        }),
      );

      // Media
      await mediaRepo.save(
        mediaRepo.create({
          tenantId,
          productId: prod.id,
          variantId: null,
          type: 'IMAGE',
          url: spec.image,
          storageKey: `products/${spec.slug}.jpg`,
          altText: spec.name,
          mimeType: 'image/jpeg',
          position: 0,
          isPrimary: true,
          status: 'READY',
        }),
      );

      // Category Link
      const catId = categoryMap.get(spec.categorySlug);
      if (catId) {
        await prodCatRepo.save(
          prodCatRepo.create({
            tenantId,
            productId: prod.id,
            categoryId: catId,
            isPrimary: true,
          }),
        );
      }
    }
  }

  // 5. Banners
  const banners = [
    {
      id: 'banner-organic-1',
      title: 'Farm-to-Table Artisan Organics',
      subtitle: 'Discover 100% natural, single-estate harvests sourced directly from certified ethical growers.',
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&fit=crop&q=80',
      ctaLabel: 'Explore Harvest',
      linkUrl: '/products',
      badgeTag: 'NEW HARVEST 2026',
      isActive: true,
      placement: 'HOME_HERO' as const,
    },
    {
      id: 'banner-organic-2',
      title: 'Single-Estate Himalayan Reserve',
      subtitle: 'Cold-pressed botanical oils, pure mountain honey & rare spice selections for true connoisseurs.',
      imageUrl: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=1600&auto=format&fit=crop&q=80',
      ctaLabel: 'Shop Reserve',
      linkUrl: '/products?category=himalayan-spices',
      badgeTag: 'LIMITED RESERVE',
      isActive: true,
      placement: 'HOME_HERO' as const,
    },
    {
      id: 'banner-organic-3',
      title: 'Handcrafted Herbal Wellness Teas',
      subtitle: 'Whole-leaf organic Darjeeling and Japanese ceremonial Matcha to revitalize mind and body.',
      imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=1600&auto=format&fit=crop&q=80',
      ctaLabel: 'Discover Teas',
      linkUrl: '/products?category=organic-teas',
      badgeTag: '20% OFF FIRST ORDER',
      isActive: true,
      placement: 'HOME_HERO' as const,
    },
  ];

  await bannerRepo.delete({ tenantId, storeId });
  for (let i = 0; i < banners.length; i++) {
    const b = banners[i]!;
    await bannerRepo.save(
      bannerRepo.create({
        tenantId,
        storeId,
        placement: b.placement,
        title: b.title,
        subtitle: b.subtitle,
        imageUrl: b.imageUrl,
        linkUrl: b.linkUrl,
        ctaLabel: b.ctaLabel,
        altText: b.title,
        sortOrder: i + 1,
        isActive: true,
        clickCount: 24 * (3 - i),
      }),
    );
  }

  // 6. Customers & Addresses
  const customerSpecs = [
    {
      firstName: 'Aarav',
      lastName: 'Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+919820012345',
      address: {
        recipientName: 'Aarav Sharma',
        phoneE164: '+919820012345',
        addressLine1: 'B-402, Sea Green Apartments, Worli Sea Face',
        addressLine2: 'Near Worli Dairy',
        city: 'Mumbai',
        stateCode: 'MH',
        stateName: 'Maharashtra',
        postalCode: '400018',
        countryCode: 'IN',
      },
    },
    {
      firstName: 'Meera',
      lastName: 'Patel',
      email: 'meera.patel@example.com',
      phone: '+919876543210',
      address: {
        recipientName: 'Meera Patel',
        phoneE164: '+919876543210',
        addressLine1: 'Villa 12, Palm Meadows, Whitefield',
        city: 'Bengaluru',
        stateCode: 'KA',
        stateName: 'Karnataka',
        postalCode: '560066',
        countryCode: 'IN',
      },
    },
    {
      firstName: 'Rohan',
      lastName: 'Sen',
      email: 'rohan.sen@example.com',
      phone: '+919811223344',
      address: {
        recipientName: 'Rohan Sen',
        phoneE164: '+919811223344',
        addressLine1: '45, Golf Links',
        city: 'New Delhi',
        stateCode: 'DL',
        stateName: 'Delhi',
        postalCode: '110003',
        countryCode: 'IN',
      },
    },
  ];

  const savedCustomers: CustomerEntity[] = [];
  for (const c of customerSpecs) {
    let cust = await customerRepo.findOne({ where: { tenantId, emailNormalized: c.email.toLowerCase() } });
    if (!cust) {
      cust = customerRepo.create({
        publicId: newPublicId(),
        tenantId,
        storeId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        emailNormalized: c.email.toLowerCase(),
        phoneE164: c.phone,
        status: 'ACTIVE',
        isGuest: false,
        acceptsMarketing: true,
      });
      cust = await customerRepo.save(cust);

      await addressRepo.save(
        addressRepo.create({
          publicId: newPublicId(),
          tenantId,
          customerId: cust.id,
          label: 'Home',
          type: 'SHIPPING',
          isDefaultShipping: true,
          isDefaultBilling: true,
          ...c.address,
        }),
      );
    }
    savedCustomers.push(cust);
  }

  // 7. Coupons
  const couponDefs = [
    { code: 'NORTHWIND10', name: 'Welcome 10% Off', discountType: 'PERCENTAGE' as const, discountValue: '10.0000', minOrderMinor: '50000' },
    { code: 'ORGANIC20', name: 'Super Organics ₹200 Off', discountType: 'FIXED_AMOUNT' as const, discountValue: '200.0000', minOrderMinor: '150000' },
    { code: 'FREESHIP', name: 'Free Express Delivery', discountType: 'FREE_SHIPPING' as const, discountValue: '0.0000', minOrderMinor: '99900' },
  ];

  for (const cp of couponDefs) {
    let coupon = await couponRepo.findOne({ where: { tenantId, code: cp.code } });
    if (!coupon) {
      coupon = couponRepo.create({
        publicId: newPublicId(),
        tenantId,
        storeId,
        code: cp.code,
        name: cp.name,
        discountType: cp.discountType,
        discountValue: cp.discountValue,
        minOrderMinor: cp.minOrderMinor,
        appliesTo: 'ORDER',
        status: 'ACTIVE',
        usageLimitTotal: 1000,
        usageLimitPerCustomer: 3,
        usageCount: 14,
      });
      await couponRepo.save(coupon);
    }
  }

  // 8. Gift Cards
  const gcCodes = [
    { code: 'NW-GIFT-5000', initialMinor: '500000', currentMinor: '500000', recipientEmail: 'aarav.sharma@example.com' },
    { code: 'NW-GIFT-2500', initialMinor: '250000', currentMinor: '185000', recipientEmail: 'meera.patel@example.com' },
  ];
  for (const gc of gcCodes) {
    const codeHash = crypto.createHash('sha256').update(gc.code).digest('hex');
    let card = await giftCardRepo.findOne({ where: { tenantId, codeHash } });
    if (!card) {
      card = giftCardRepo.create({
        publicId: newPublicId(),
        tenantId,
        codeHash,
        codeLast4: gc.code.slice(-4),
        initialValueMinor: gc.initialMinor,
        balanceMinor: gc.currentMinor,
        currency: 'INR',
        issuedToEmail: gc.recipientEmail,
        status: 'ACTIVE',
      });
      await giftCardRepo.save(card);
    }
  }

  // 9. Reviews
  const allProds = await productRepo.find({ where: { tenantId } });
  const reviewComments = [
    { rating: 5, title: 'Absolute world-class quality!', body: 'The aroma and freshness are unmatched. Sourced directly from farms and you can taste the difference immediately.', author: 'Aarav S.' },
    { rating: 5, title: 'Best organic pantry store', body: 'Packaged very carefully in eco-friendly materials. Delivery was super prompt.', author: 'Meera P.' },
    { rating: 4, title: 'Very authentic and pure', body: 'Genuine artisanal flavor. Will definitely reorder for my entire family.', author: 'Rohan S.' },
  ];

  for (let i = 0; i < Math.min(allProds.length, 6); i++) {
    const p = allProds[i]!;
    const revSpec = reviewComments[i % reviewComments.length]!;
    const existing = await reviewRepo.findOne({ where: { tenantId, productId: p.id } });
    if (!existing) {
      await reviewRepo.save(
        reviewRepo.create({
          publicId: newPublicId(),
          tenantId,
          storeId,
          productId: p.id,
          customerId: savedCustomers[0]?.id ?? null,
          rating: revSpec.rating,
          title: revSpec.title,
          body: revSpec.body,
          authorName: revSpec.author,
          status: 'APPROVED',
          isVerifiedPurchase: true,
          helpfulCount: 8,
        }),
      );
    }
  }

  // 10. Provision Filesystem Workspace for Northwind
  const themeDir = path.resolve(process.cwd(), 'storage', 'tenants', 'northwind', 'themes', 'organic');
  fs.mkdirSync(themeDir, { recursive: true });
  const assetsDir = path.resolve(process.cwd(), 'storage', 'tenants', 'northwind', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const overrides = {
    logoUrl: store.logoUrl,
    faviconUrl: store.faviconUrl,
    banners: banners,
    customizer: {
      primaryColor: '#16a34a',
      accentColor: '#15803d',
      surfaceColor: '#f0fdf4',
      textColor: '#052e16',
      headingFont: 'Lora',
      bodyFont: 'Inter',
      customCss: '/* Northwind Traders Organic Theme */\n.site-header { backdrop-filter: blur(8px); }',
    },
  };
  fs.writeFileSync(path.join(themeDir, 'overrides.json'), JSON.stringify(overrides, null, 2), 'utf8');

  const themeCss = `:root {
  --brand-primary: #16a34a;
  --brand-accent: #15803d;
  --brand-surface: #f0fdf4;
  --brand-text: #052e16;
  --font-heading: 'Lora', serif;
  --font-body: 'Inter', sans-serif;
}

/* Northwind Traders Organic Theme */
.site-header { backdrop-filter: blur(8px); }
`;
  fs.writeFileSync(path.join(themeDir, 'theme.css'), themeCss, 'utf8');

  console.log('✔ Successfully populated Northwind Traders with 12 rich organic products, 6 categories, 5 brands, hero banners, customers, coupons, reviews, and workspace files!');
}

async function main() {
  console.log('▶ Connecting to database…');
  await dataSource.initialize();
  try {
    await seedNorthwindRichData(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to seed Northwind rich data:', err);
    process.exit(1);
  });
}
