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
  InventoryLevelEntity,
  WarehouseEntity,
} from '../entities';

export async function seedOrganicDoorstepCatalog(ds: DataSource) {
  const tenantRepo = ds.getRepository(TenantEntity);
  const storeRepo = ds.getRepository(StoreEntity);
  const brandRepo = ds.getRepository(BrandEntity);
  const categoryRepo = ds.getRepository(CategoryEntity);
  const productRepo = ds.getRepository(ProductEntity);
  const variantRepo = ds.getRepository(ProductVariantEntity);
  const mediaRepo = ds.getRepository(ProductMediaEntity);
  const prodCatRepo = ds.getRepository(ProductCategoryEntity);
  const bannerRepo = ds.getRepository(BannerEntity);
  const warehouseRepo = ds.getRepository(WarehouseEntity);
  const inventoryRepo = ds.getRepository(InventoryLevelEntity);

  console.log('🌿 Seeding "Organic Foods at your Doorsteps" Store Catalog...');

  const allTenants = await tenantRepo.find();

  for (const tenant of allTenants) {
    console.log(`Populating tenant: ${tenant.slug} (${tenant.businessName})`);
    tenant.storefrontTheme = 'organic';
    tenant.allowedStorefrontThemes = ['default', 'organic', 'famms', 'circuit', 'harvest'];
    await tenantRepo.save(tenant);

    const tenantId = tenant.id;

    // 1. Store
    let store = await storeRepo.findOne({ where: { tenantId } });
    if (!store) {
      store = storeRepo.create({
        publicId: newPublicId(),
        tenantId,
        name: 'Organic Harvest — 100% Organic Foods at your Doorstep',
        slug: `${tenant.slug}-store`,
        status: 'ACTIVE',
        currency: 'INR',
        logoUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
        faviconUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=64&auto=format&fit=crop&q=80',
      });
      store = await storeRepo.save(store);
    } else {
      store.name = 'Organic Harvest — 100% Organic Foods at your Doorstep';
      store.logoUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
      store.faviconUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=64&auto=format&fit=crop&q=80';
      await storeRepo.save(store);
    }
    const storeId = store.id;

    // 2. Warehouse
    let warehouse = await warehouseRepo.findOne({ where: { tenantId } });
    if (!warehouse) {
      warehouse = warehouseRepo.create({
        publicId: newPublicId(),
        tenantId,
        storeId,
        name: 'Mumbai Farm Fresh Hub',
        code: 'WH-FARM-01',
        addressLine1: 'Agro Logistics Park, Sector 18',
        city: 'Mumbai',
        stateCode: 'MH',
        postalCode: '400051',
        countryCode: 'IN',
        type: 'WAREHOUSE',
        priority: 1,
        isDefault: true,
        isActive: true,
      });
      warehouse = await warehouseRepo.save(warehouse);
    }

    // 3. Brands
    const brandDefs = [
      { name: "Nature's Doorstep Organics", slug: 'natures-doorstep', description: 'Certified farm-to-table organic produce & kitchen essentials.' },
      { name: 'Vedic A2 Organic Dairy', slug: 'vedic-a2-dairy', description: 'Authentic bilona ghee and grass-fed dairy products.' },
      { name: 'Pure Green Bio-Harvest', slug: 'pure-green-bio', description: 'Pesticide-free hydroponic vegetables and leafy greens.' },
      { name: 'Himalayan Organic Estates', slug: 'himalayan-estates', description: 'High-altitude wild forest honey, teas, and spices.' },
      { name: 'SunRoot Artisan Pantry', slug: 'sunroot-artisan', description: 'Wood cold-pressed oils and ancient unpolished millets.' },
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

    // 4. Categories
    const categoryDefs = [
      {
        name: 'Farm-Fresh Organic Vegetables',
        slug: 'farm-fresh-vegetables',
        description: 'Crisp, pesticide-free seasonal vegetables harvested daily at sunrise.',
        imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=800&auto=format&fit=crop&q=80',
      },
      {
        name: 'Orchard Fresh Organic Fruits',
        slug: 'orchard-fresh-fruits',
        description: 'Naturally tree-ripened, chemical-free organic fruits loaded with vitamins.',
        imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=800&auto=format&fit=crop&q=80',
      },
      {
        name: 'A2 Dairy & Vedic Bilona Ghee',
        slug: 'a2-dairy-and-ghee',
        description: 'Hand-churned Vedic Bilona Ghee and pure dairy from grass-fed Gir cows.',
        imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
      },
      {
        name: 'Cold-Pressed Oils & Raw Forest Honey',
        slug: 'cold-pressed-oils-and-honey',
        description: 'Wooden Kolhu pressed unrefined oils and raw unheated wildflower honey.',
        imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&auto=format&fit=crop&q=80',
      },
      {
        name: 'Ancient Grains, Millets & Pulses',
        slug: 'organic-grains-and-pulses',
        description: 'Unpolished indigenous dals, ancient gluten-free millets, and stone-ground flours.',
        imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
      },
      {
        name: 'Herbal Teas & Daily Superfoods',
        slug: 'herbal-teas-and-superfoods',
        description: 'Single-estate Darjeeling teas, ceremonial Japanese Matcha, and raw nuts & seeds.',
        imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&auto=format&fit=crop&q=80',
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

    // 5. Products Specification
    const productSpecs = [
      {
        name: 'Organic Hydroponic Baby Spinach (250g)',
        slug: 'organic-hydroponic-baby-spinach-250g',
        sku: 'ORG-SPINACH-250',
        brandSlug: 'pure-green-bio',
        categorySlug: 'farm-fresh-vegetables',
        priceMinor: '8900', // ₹89.00
        comparePriceMinor: '11000', // ₹110.00
        shortDescription: 'Tender, pesticide-free hydroponic baby spinach washed in pure ozone water and delivered crisp.',
        description: '<p>Our <strong>Hydroponic Baby Spinach</strong> is grown in state-of-the-art chemical-free indoor greenhouses. Rich in iron, lutein, and vitamins A & C, it is harvested on the morning of delivery.</p><ul><li>100% Pesticide & Heavy Metal Free</li><li>Ozone Washed & Ready to Eat</li><li>Delivered Fresh within Hours</li></ul>',
        image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 250,
      },
      {
        name: 'Farm-Fresh Organic Hass Avocados (Pack of 3)',
        slug: 'farm-fresh-organic-hass-avocados-pack-3',
        sku: 'ORG-AVOCADO-3PK',
        brandSlug: 'natures-doorstep',
        categorySlug: 'orchard-fresh-fruits',
        priceMinor: '34900', // ₹349.00
        comparePriceMinor: '42000', // ₹420.00
        shortDescription: 'Nutrient-dense buttery Hass avocados, naturally grown without synthetic chemicals.',
        description: '<p>Premium Grade-A <strong>Organic Hass Avocados</strong> loaded with heart-healthy monounsaturated fats, dietary fiber, and potassium. Perfect for guacamole, salads, and healthy morning toasts.</p>',
        image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 550,
      },
      {
        name: 'Heirloom Organic Cherry Tomatoes (300g)',
        slug: 'heirloom-organic-cherry-tomatoes-300g',
        sku: 'ORG-CHERRY-TOM-300',
        brandSlug: 'pure-green-bio',
        categorySlug: 'farm-fresh-vegetables',
        priceMinor: '12900', // ₹129.00
        comparePriceMinor: '16000', // ₹160.00
        shortDescription: 'Sun-ripened, burstingly sweet heirloom cherry tomatoes bursting with natural lycopene.',
        description: '<p>Vibrant, naturally sweet <strong>Heirloom Cherry Tomatoes</strong> ripened on the vine in solar-powered organic polyhouses. Crisp bite and intense natural flavor.</p>',
        image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 300,
      },
      {
        name: 'Vedic A2 Gir Cow Cultured Bilona Ghee (500ml)',
        slug: 'vedic-a2-gir-cow-bilona-ghee-500ml',
        sku: 'ORG-A2-GHEE-500',
        brandSlug: 'vedic-a2-dairy',
        categorySlug: 'a2-dairy-and-ghee',
        priceMinor: '145000', // ₹1,450.00
        comparePriceMinor: '175000', // ₹1,750.00
        shortDescription: 'Handmade cultured ghee prepared from grass-fed Gir cows using traditional wooden bilona churning.',
        description: '<p>Authentic <strong>A2 Bilona Ghee</strong> made by boiling whole milk from free-grazing indigenous Gir cows, setting it to curd, and churning it with wooden bilona. Granular texture with divine aroma.</p><ul><li>Lab Tested A2 Beta-Casein Protein</li><li>Rich in Butyric Acid & Fat Soluble Vitamins</li><li>Zero Preservatives or Additives</li></ul>',
        image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 500,
      },
      {
        name: 'Unfiltered Raw Forest Honey with Honeycomb (500g)',
        slug: 'unfiltered-raw-forest-honey-500g',
        sku: 'ORG-RAW-HONEY-500',
        brandSlug: 'himalayan-estates',
        categorySlug: 'cold-pressed-oils-and-honey',
        priceMinor: '65000', // ₹650.00
        comparePriceMinor: '78000', // ₹780.00
        shortDescription: '100% pure, unheated wildflower honey harvested ethically from deep Himalayan forests.',
        description: '<p>Never heated or ultra-filtered. Contains live enzymes, trace minerals, and natural pollen grains. Sourced responsibly by indigenous tribal beekeepers.</p>',
        image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 500,
      },
      {
        name: 'Wood-Pressed Yellow Mustard Oil (1 Litre)',
        slug: 'wood-pressed-yellow-mustard-oil-1l',
        sku: 'ORG-MUSTARD-OIL-1L',
        brandSlug: 'sunroot-artisan',
        categorySlug: 'cold-pressed-oils-and-honey',
        priceMinor: '38000', // ₹380.00
        comparePriceMinor: '45000', // ₹450.00
        shortDescription: 'Single-estate yellow mustard seeds cold-pressed slowly in wooden Kolhu churns.',
        description: '<p>Cold-extracted under 45°C to preserve vital omega-3 fatty acids, natural antioxidants, and authentic pungent flavor. Ideal for high-heat Indian cooking.</p>',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 1000,
      },
      {
        name: 'Organic Alphonso Mangoes - Tree Ripened (Box of 6)',
        slug: 'organic-alphonso-mangoes-box-6',
        sku: 'ORG-MANGO-BOX6',
        brandSlug: 'natures-doorstep',
        categorySlug: 'orchard-fresh-fruits',
        priceMinor: '89900', // ₹899.00
        comparePriceMinor: '110000', // ₹1,100.00
        shortDescription: 'Naturally ripened in hay grass without carbide. Unrivalled sweetness and rich tropical aroma.',
        description: '<p>GI-tagged Ratnagiri <strong>Organic Alphonso Mangoes</strong> hand-harvested at peak maturity and ripened traditionally in dry rice hay.</p>',
        image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 1500,
      },
      {
        name: 'Organic Unpolished Foxtail Millet (1kg)',
        slug: 'organic-unpolished-foxtail-millet-1kg',
        sku: 'ORG-FOXTAIL-1KG',
        brandSlug: 'sunroot-artisan',
        categorySlug: 'organic-grains-and-pulses',
        priceMinor: '19900', // ₹199.00
        comparePriceMinor: '24000', // ₹240.00
        shortDescription: 'Gluten-free, diabetic-friendly ancient millet rich in dietary fiber and mineral complex.',
        description: '<p>Traditional indigenous <strong>Foxtail Millet (Kangni)</strong> grown by tribal farmers without artificial fertilizers. A low-glycemic replacement for white rice.</p>',
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 1000,
      },
      {
        name: 'Single-Origin Arabica Dark Roast Coffee Beans (250g)',
        slug: 'single-origin-arabica-coffee-beans-250g',
        sku: 'ORG-COFFEE-250',
        brandSlug: 'himalayan-estates',
        categorySlug: 'herbal-teas-and-superfoods',
        priceMinor: '69900', // ₹699.00
        comparePriceMinor: '85000', // ₹850.00
        shortDescription: 'Shade-grown, hand-picked Arabica beans from high-altitude estates with notes of dark chocolate & vanilla.',
        description: '<p>Grown at 4,500 feet under dense rainforest canopy. Small-batch artisan roasted to bring out rich cocoa body and caramel sweetness.</p>',
        image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 250,
      },
      {
        name: 'Certified Organic Kashmiri Saffron Threads (1g)',
        slug: 'certified-organic-kashmiri-saffron-1g',
        sku: 'ORG-SAFFRON-1G',
        brandSlug: 'himalayan-estates',
        categorySlug: 'herbal-teas-and-superfoods',
        priceMinor: '79900', // ₹799.00
        comparePriceMinor: '95000', // ₹950.00
        shortDescription: 'Grade-1 Mongra Kashmiri Saffron hand-picked from the historic purple flower fields of Pampore.',
        description: '<p>Recognized globally for its deep crimson stigma, high crocin content, and mesmerizing floral aroma. Ideal for ayurvedic golden milk and culinary delicacies.</p>',
        image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 1,
      },
      {
        name: 'Cold-Pressed Virgin Coconut Oil (500ml)',
        slug: 'cold-pressed-virgin-coconut-oil-500ml',
        sku: 'ORG-COCONUT-OIL-500',
        brandSlug: 'natures-doorstep',
        categorySlug: 'cold-pressed-oils-and-honey',
        priceMinor: '44900', // ₹449.00
        comparePriceMinor: '52000', // ₹520.00
        shortDescription: 'Centrifuge-extracted fresh organic coconut milk oil with mild tropical aroma.',
        description: '<p>Zero chemicals, zero heat. Retains medium chain triglycerides (MCTs) and lauric acid for immune support and clean culinary cooking.</p>',
        image: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 500,
      },
      {
        name: 'Organic First Flush Darjeeling Green Tea (100g)',
        slug: 'organic-first-flush-darjeeling-green-tea-100g',
        sku: 'ORG-GREEN-TEA-100',
        brandSlug: 'himalayan-estates',
        categorySlug: 'herbal-teas-and-superfoods',
        priceMinor: '54900', // ₹549.00
        comparePriceMinor: '65000', // ₹650.00
        shortDescription: 'Whole tender green tea leaves offering fresh floral muscatel notes with abundant polyphenols.',
        description: '<p>Single-estate bio-dynamic tea from misty Himalayan slopes. Pan-fired to preserve delicate antioxidants and soothing aroma.</p>',
        image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=1000&auto=format&fit=crop&q=80',
        weightGrams: 100,
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
      } else {
        prod.name = spec.name;
        prod.priceMinor = spec.priceMinor;
        prod.comparePriceMinor = spec.comparePriceMinor;
        prod.shortDescription = spec.shortDescription;
        prod.description = spec.description;
        await productRepo.save(prod);
      }
    }

    // 6. Banners
    const heroBanners = [
      {
        title: '100% Organic Foods at your Doorsteps',
        subtitle: 'Harvested at dawn from certified organic bio-farms and delivered crisp & fresh to your kitchen within 24 hours.',
        imageUrl: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=1600&auto=format&fit=crop&q=80',
        ctaLabel: 'Shop Fresh Harvest',
        linkUrl: '/products',
        badgeTag: '🌿 FARM-TO-TABLE FRESH',
      },
      {
        title: 'Pure Vedic A2 Dairy & Cold-Pressed Elixirs',
        subtitle: 'Bilona Hand-Churned A2 Ghee, Unfiltered Raw Honey, and Wood-Pressed Virgin Oils for family wellness.',
        imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&fit=crop&q=80',
        ctaLabel: 'Explore Pure Pantry',
        linkUrl: '/products',
        badgeTag: '✨ 100% PURE & NATURAL',
      },
      {
        title: 'Ancient Millets, Heritage Grains & Pulses',
        subtitle: 'Unpolished organic millets, high-protein mountain pulses, and whole grains for clean, nutritious everyday meals.',
        imageUrl: 'https://images.unsplash.com/photo-1506484381205-f7945653044d?w=1600&auto=format&fit=crop&q=80',
        ctaLabel: 'Order Daily Essentials',
        linkUrl: '/products',
        badgeTag: '🌾 CERTIFIED ORGANIC',
      },
    ];

    await bannerRepo.delete({ tenantId, storeId });
    for (let i = 0; i < heroBanners.length; i++) {
      const b = heroBanners[i]!;
      await bannerRepo.save(
        bannerRepo.create({
          tenantId,
          storeId,
          placement: 'HOME_HERO',
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          ctaLabel: b.ctaLabel,
          altText: b.title,
          sortOrder: i + 1,
          isActive: true,
          clickCount: 15 * (3 - i),
        }),
      );
    }

    // 7. Store Theme Directory Overrides
    const tenantThemesDir = path.resolve(process.cwd(), 'storage', 'tenants', tenant.slug, 'themes', 'organic');
    fs.mkdirSync(tenantThemesDir, { recursive: true });

    const overridesJson = {
      palette: {
        primary: '#16a34a',
        accent: '#15803d',
        surface: '#f0fdf4',
        text: '#052e16',
      },
      typography: {
        headingFont: 'Lora',
        bodyFont: 'Inter',
      },
      branding: {
        logoUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
        faviconUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=64&auto=format&fit=crop&q=80',
        banners: heroBanners,
      },
    };
    fs.writeFileSync(path.join(tenantThemesDir, 'overrides.json'), JSON.stringify(overridesJson, null, 2), 'utf8');

    console.log(`✅ Tenant ${tenant.slug} updated with Organic Doorstep data.`);
  }
}

if (require.main === module) {
  dataSource
    .initialize()
    .then(async (ds) => {
      await seedOrganicDoorstepCatalog(ds);
      console.log('🎉 Organic Doorstep Catalog Seeding Completed Successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
