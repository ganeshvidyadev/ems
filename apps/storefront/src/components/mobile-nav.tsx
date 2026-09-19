'use client';

import { Home, Compass, Heart, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/use-cart';
import { useWishlist } from '@/lib/use-wishlist';
import { useCustomer } from '@/lib/customer-context';

/**
 * Mobile Bottom Navigation Bar.
 * Provides a native app-like tab bar on smartphone screens.
 * Automatically updates active state and dynamic badges for cart & wishlist.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { itemCount, isLoading: cartLoading } = useCart();
  const { wishlistItems } = useWishlist();
  const { isAuthenticated } = useCustomer();

  // Hide on checkout flow and printable views
  if (pathname.startsWith('/checkout')) {
    return null;
  }

  const navItems = [
    {
      href: '/',
      label: 'Home',
      icon: Home,
      isActive: pathname === '/',
    },
    {
      href: '/products',
      label: 'Shop',
      icon: Compass,
      isActive: pathname.startsWith('/products'),
    },
    {
      href: '/account/wishlist',
      label: 'Wishlist',
      icon: Heart,
      isActive: pathname.startsWith('/account/wishlist'),
      badge: wishlistItems.length > 0 ? wishlistItems.length : null,
    },
    {
      href: '/cart',
      label: 'Cart',
      icon: ShoppingBag,
      isActive: pathname === '/cart',
      badge: !cartLoading && itemCount > 0 ? (itemCount > 99 ? '99+' : itemCount) : null,
    },
    {
      href: isAuthenticated ? '/account' : '/account/login',
      label: 'Account',
      icon: User,
      isActive: pathname.startsWith('/account') && !pathname.startsWith('/account/wishlist'),
    },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-line bg-surface/95 backdrop-blur-md px-2 sm:hidden print:hidden"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const activeClass = item.isActive ? 'font-semibold text-brand' : 'text-ink-muted hover:text-ink';
        return (
          <Link
            key={item.href}
            href={item.href}
            className={'relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors ' + activeClass}
          >
            <div className="relative">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.badge !== null && (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground shadow-sm">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="mt-1 text-[11px] leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
