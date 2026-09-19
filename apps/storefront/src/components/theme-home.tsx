import Link from 'next/link';
import {
  ArrowRight,
  Leaf,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Zap,
  Cpu,
  Flame,
  Clock,
  Sparkles,
  BadgeCheck,
} from 'lucide-react';
import type { ProductResponse } from '@ems/contracts';
import { ProductGrid } from './product-card';
import type { StorefrontTheme } from '@/lib/theme';

interface Props {
  theme: StorefrontTheme;
  name: string;
  featured: ProductResponse[];
  latest: ProductResponse[];
  failed: boolean;
}

function Products({
  products,
  failed,
  title,
}: {
  products: ProductResponse[];
  failed: boolean;
  title: string;
}) {
  return (
    <section className="theme-container theme-shelf" id="collection">
      <div className="theme-section-title">
        <h2>{title}</h2>
        <Link href="/products">
          View all <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      {failed ? (
        <p className="theme-notice" role="status">
          We could not load the catalogue just now. Please refresh in a moment.
        </p>
      ) : products.length ? (
        <ProductGrid products={products} />
      ) : (
        <p className="theme-notice">
          Our collection is coming soon. Please check back for new products.
        </p>
      )}
    </section>
  );
}

export function ThemeHome({ theme, name, featured, latest, failed }: Props) {
  const products = [
    ...featured,
    ...latest.filter((product) => !featured.some((item) => item.id === product.id)),
  ];

  // 1. FAMMS - Fashion & Lifestyle Luxury
  if (theme === 'famms') {
    return (
      <div className="theme-home famms-home">
        <section className="famms-hero">
          <div className="theme-container">
            <div className="famms-hero-copy">
              <p className="theme-eyebrow">{name}</p>
              <h1>
                <span>Discover Your</span>
                <br />
                Everyday Style
              </h1>
              <p>
                Find your next favourite in our latest collection. Thoughtfully selected essentials,
                all in one place.
              </p>
              <Link className="theme-button" href="/products">
                Shop Now
              </Link>
            </div>
          </div>
        </section>
        <section className="theme-container famms-benefits">
          <h2>Why Shop With Us</h2>
          <div className="theme-benefit-grid">
            <article>
              <Truck aria-hidden />
              <h3>Easy Shopping</h3>
              <p>Browse the collection from wherever you are.</p>
            </article>
            <article>
              <ShoppingBag aria-hidden />
              <h3>Your Favourites</h3>
              <p>Keep your picks together in your shopping bag.</p>
            </article>
            <article>
              <PackageCheck aria-hidden />
              <h3>Order Updates</h3>
              <p>View your order confirmation after checkout.</p>
            </article>
          </div>
        </section>
        <section className="famms-arrivals">
          <div className="theme-container">
            <div>
              <h2>#NewArrivals</h2>
              <p>Make room for something new. Explore the latest additions from {name}.</p>
              <Link href="/products" className="theme-button">
                Shop Now
              </Link>
            </div>
          </div>
        </section>
        <Products products={products} failed={failed} title="Our products" />
        <section className="famms-discover">
          <h2>Find your next favourite</h2>
          <p>New inspiration starts with a look through our collection.</p>
          <Link className="theme-button" href="/products">
            Explore the collection
          </Link>
        </section>
      </div>
    );
  }

  // 2. CIRCUIT - High-Tech Electronics & Gadgets
  if (theme === 'circuit') {
    return (
      <div className="theme-home circuit-home space-y-12">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 text-white p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
              <Zap className="h-3.5 w-3.5 text-blue-400" /> High-Performance Tech & Gadgets
            </span>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
              Engineered For The Future.
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Explore cutting-edge gear from {name} with official manufacturer warranty and express dispatch.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/products"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition"
              >
                Browse Catalog
              </Link>
              <Link
                href="#collection"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                View Best Sellers
              </Link>
            </div>
          </div>
        </section>

        {/* Tech Specs & Trust Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-line bg-surface p-4 text-center">
            <Cpu className="h-6 w-6 text-blue-600 mx-auto mb-1.5" />
            <p className="font-bold text-xs text-ink">100% Genuine Specs</p>
            <p className="text-[10px] text-ink-muted">Verified OEM Hardware</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 text-center">
            <ShieldCheck className="h-6 w-6 text-blue-600 mx-auto mb-1.5" />
            <p className="font-bold text-xs text-ink">Brand Warranty</p>
            <p className="text-[10px] text-ink-muted">1-Year Hassle-Free Coverage</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 text-center">
            <Truck className="h-6 w-6 text-blue-600 mx-auto mb-1.5" />
            <p className="font-bold text-xs text-ink">Express Air Delivery</p>
            <p className="text-[10px] text-ink-muted">Secure Shockproof Packing</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 text-center">
            <Sparkles className="h-6 w-6 text-blue-600 mx-auto mb-1.5" />
            <p className="font-bold text-xs text-ink">Lowest Price Match</p>
            <p className="text-[10px] text-ink-muted">Guaranteed Authentic Prices</p>
          </div>
        </div>

        <Products products={products} failed={failed} title="Featured Tech & Gadgets" />
      </div>
    );
  }

  // 3. HARVEST - Supermarket, Grocery & Daily Essentials
  if (theme === 'harvest') {
    return (
      <div className="theme-home harvest-home space-y-12">
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-lime-50 p-8 sm:p-14 text-emerald-950 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-xl space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-600/20">
              <Clock className="h-3.5 w-3.5 text-emerald-700" /> Fast 2-Hour Home Delivery
            </span>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-950">
              Fresh Daily Essentials Delivered To Your Doorstep.
            </h1>
            <p className="text-emerald-800 text-sm leading-relaxed">
              Farm-fresh produce, groceries, and household staples from {name}.
            </p>
            <div className="pt-3">
              <Link
                href="/products"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white shadow hover:bg-emerald-800 transition"
              >
                Shop Fresh Groceries →
              </Link>
            </div>
          </div>
        </section>

        {/* Grocery Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-xs text-ink">100% Farm Fresh</p>
              <p className="text-[10px] text-ink-muted">Hand-sorted Quality</p>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-xs text-ink">Daily Super Deals</p>
              <p className="text-[10px] text-ink-muted">Up to 40% Off Essentials</p>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-xs text-ink">Free Local Delivery</p>
              <p className="text-[10px] text-ink-muted">On Orders Above ₹499</p>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-xs text-ink">Zero Questions Return</p>
              <p className="text-[10px] text-ink-muted">Instant Doorstep Refunds</p>
            </div>
          </div>
        </div>

        <Products products={products} failed={failed} title="Daily Fresh Groceries & Staples" />
      </div>
    );
  }

  // 4. ORGANIC - Botanical, Health & Wellness
  return (
    <div className="theme-home organic-home">
      <section className="organic-hero">
        <div className="theme-container">
          <div className="organic-hero-copy">
            <p className="theme-eyebrow">{name}</p>
            <h1>
              <strong>Organic</strong> Foods at your <b>Doorsteps</b>
            </h1>
            <p>A fresh approach to your everyday shopping.</p>
            <div className="theme-actions">
              <Link className="theme-button" href="/products">
                Start Shopping
              </Link>
              <Link className="theme-button theme-button-dark" href="#collection">
                Explore Collection
              </Link>
            </div>
            <div className="organic-highlights">
              <div>
                <Leaf aria-hidden />
                <span>
                  Fresh
                  <br />
                  inspiration
                </span>
              </div>
              <div>
                <ShieldCheck aria-hidden />
                <span>
                  Quality
                  <br />
                  assured
                </span>
              </div>
              <div>
                <Truck aria-hidden />
                <span>
                  Delivered
                  <br />
                  to you
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="theme-container organic-features">
        <div className="theme-feature-grid">
          <article>
            <Truck aria-hidden />
            <div>
              <h3>Free delivery</h3>
              <p>On orders meeting minimum spend.</p>
            </div>
          </article>
          <article>
            <ShieldCheck aria-hidden />
            <div>
              <h3>100% secure</h3>
              <p>Protected payment on checkout.</p>
            </div>
          </article>
          <article>
            <PackageCheck aria-hidden />
            <div>
              <h3>Quality guarantee</h3>
              <p>Hand-picked for our collection.</p>
            </div>
          </article>
          <article>
            <ShoppingBag aria-hidden />
            <div>
              <h3>Explore</h3>
              <p>Your next order starts right here.</p>
            </div>
          </article>
        </div>
      </section>
      <section className="theme-container organic-categories">
        <div className="theme-section-title">
          <h2>Explore the collection</h2>
          <Link href="/products">
            View all <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="organic-category-grid">
          {['Breads', 'Fruits', 'Vegetables', 'Drinks', 'Meat', 'Snacks'].map((label, index) => (
            <Link href={`/products?q=${encodeURIComponent(label)}`} key={label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/themes/organic/images/category-thumb-${index + 1}.jpg`}
                alt=""
                width={150}
                height={150}
              />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>
      <Products products={products} failed={failed} title="Our products" />
      <section className="theme-container organic-promos">
        <Link href="/products" className="organic-promo-main">
          <h2>Everyday favourites</h2>
          <p>Discover something fresh</p>
          <span>Shop now →</span>
        </Link>
        <div>
          <Link href="/products?sort=-totalSold">
            <h2>Popular picks</h2>
            <p>Explore the collection</p>
            <span>Shop now →</span>
          </Link>
          <Link href="/products">
            <h2>New arrivals</h2>
            <p>Find your next favourite</p>
            <span>Shop now →</span>
          </Link>
        </div>
      </section>
      <section className="theme-container organic-discover">
        <div>
          <h2>A little inspiration for your next shop</h2>
          <p>Explore everything {name} has to offer.</p>
          <Link href="/products" className="theme-button">
            Browse all products
          </Link>
        </div>
      </section>
    </div>
  );
}
