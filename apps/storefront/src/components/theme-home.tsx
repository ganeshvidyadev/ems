import Link from 'next/link';
import { ArrowRight, Leaf, PackageCheck, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
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
  if (theme === 'famms')
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
                <ShoppingBag aria-hidden />
                <span>
                  Everyday
                  <br />
                  essentials
                </span>
              </div>
              <div>
                <PackageCheck aria-hidden />
                <span>
                  Simple
                  <br />
                  shopping
                </span>
              </div>
            </div>
          </div>
          <div className="organic-benefits">
            <article>
              <Leaf aria-hidden />
              <div>
                <h3>Thoughtfully selected</h3>
                <p>Discover your everyday favourites.</p>
              </div>
            </article>
            <article>
              <ShieldCheck aria-hidden />
              <div>
                <h3>Shop your way</h3>
                <p>Explore the collection at your pace.</p>
              </div>
            </article>
            <article>
              <Truck aria-hidden />
              <div>
                <h3>From us to you</h3>
                <p>Your next order starts right here.</p>
              </div>
            </article>
          </div>
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
