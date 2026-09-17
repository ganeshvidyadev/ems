'use client';

import type { UserSummary } from '@ems/contracts';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Cable,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  DatabaseBackup,
  FileText,
  Gauge,
  Globe,
  HeartPulse,
  History,
  Hourglass,
  Image as ImageIcon,
  Landmark,
  LayoutDashboard,
  LayoutList,
  LifeBuoy,
  ListTodo,
  LogOut,
  Menu,
  Monitor,
  Navigation,
  Package,
  Paintbrush,
  Palette,
  PanelLeftClose,
  Percent,
  Receipt,
  RotateCcw,
  ScrollText,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AdminThemeContext } from './admin-theme';
import { GlobalSearchPalette } from './global-search-palette';

type NavigationItem = { href: string; label: string };
/** A labeled section of the sidebar — see `SUPER_ADMIN_NAV` in layout.tsx. */
type NavigationGroup = { label: string; items: readonly NavigationItem[] };
const icons: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/analytics': BarChart3,
  '/platform-health': HeartPulse,
  '/alerts': Bell,
  '/tenants': Building2,
  '/platform-staff': UserCog,
  '/themes': Palette,
  '/theme-templates': Paintbrush,
  '/plans': LayoutList,
  '/settlements': Landmark,
  '/quota': Gauge,
  '/billing': Receipt,
  '/dunning': Hourglass,
  '/support': LifeBuoy,
  '/integrations': Cable,
  '/tenant-export': DatabaseBackup,
  '/audit-log': History,
  '/logs': ScrollText,
  '/queues': ListTodo,
  '/platform-settings': Settings,
  '/orders': ShoppingBag,
  '/products': Package,
  '/inventory': Boxes,
  '/customers': Users,
  '/coupons': Tag,
  '/sessions': Monitor,
  '/system': Activity,
  '/settings': Settings,
  '/domains': Globe,
  '/taxes': Percent,
  '/team': UserCheck,
  '/subscription': Sparkles,
  '/support-tickets': LifeBuoy,
  '/shipments': Truck,
  '/returns': RotateCcw,
  '/warehouses': Warehouse,
  '/theme-editor': Paintbrush,
  '/cms': FileText,
  '/banners': ImageIcon,
  '/menus': Navigation,
  '/reviews': Star,
  '/channels': Cable,
  '/marketplace': Store,
  '/loyalty': Award,
};

/** All state here controls presentation. Navigation and account actions are supplied by the app. */
export function MantisAdminShell({
  user,
  pathname,
  items,
  homeHref = '/',
  badge,
  impersonating,
  onExitImpersonation,
  logout,
  children,
}: {
  user: UserSummary;
  pathname: string;
  items: readonly NavigationGroup[];
  /**
   * Where the brand mark and breadcrumb "Dashboard" crumb link to. Platform
   * super admins have no store of their own, so `/` (the tenant dashboard)
   * 403s for them — callers in that mode pass their own landing page instead.
   */
  homeHref?: string;
  badge?: string;
  impersonating?: boolean;
  onExitImpersonation?: () => void | Promise<unknown>;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const flatItems = items.flatMap((group) => group.items);
  const current = flatItems.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );
  return (
    <AdminThemeContext.Provider value>
      {impersonating && (
        <div className="mantis-impersonation-banner flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-950 sticky top-0 z-50 shadow-sm">
          <span>
            Viewing as {user.firstName} · {user.tenant?.businessName ?? 'this tenant'} (impersonating)
          </span>
          {onExitImpersonation && (
            <button
              type="button"
              className="rounded border border-black/30 bg-black/10 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-black/20 transition-colors"
              onClick={() => void onExitImpersonation()}
            >
              Exit impersonation
            </button>
          )}
        </div>
      )}
      <div className="mantis-admin mantis-shell" data-collapsed={collapsed}>
        <a className="mantis-skip" href="#main">
          Skip to content
        </a>
        <aside className="mantis-sidebar" aria-label="Admin sidebar" id="admin-sidebar">
          <Brand homeHref={homeHref} />
          <Sidebar items={items} pathname={pathname} />
          <div className="mantis-sidebar-footer">
            EMS Console<span>{badge ?? (user.userType === 'PLATFORM' ? 'Super Admin' : (user.tenant?.businessName ?? 'Merchant'))}</span>
          </div>
        </aside>
        <header className="mantis-topbar">
          <button
            type="button"
            className="mantis-icon-button mantis-desktop-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <Menu /> : <PanelLeftClose />}
          </button>
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="mantis-icon-button mantis-mobile-toggle"
                aria-label="Open navigation"
              >
                <Menu />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="mantis-admin mantis-drawer-overlay" />
              <Dialog.Content className="mantis-admin mantis-drawer" aria-describedby={undefined}>
                <Dialog.Title className="sr-only">Admin navigation</Dialog.Title>
                <Brand homeHref={homeHref} />
                <Dialog.Close
                  className="mantis-icon-button mantis-drawer-close"
                  aria-label="Close navigation"
                >
                  <X />
                </Dialog.Close>
                <Sidebar
                  items={items}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="mantis-topbar-title">
            {user.userType === 'PLATFORM' ? 'EMS Platform' : (user.tenant?.businessName ?? 'EMS Console')}
          </span>
          <GlobalSearchPalette />
          <div className="mantis-account">
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button type="button" className="mantis-profile" aria-label="Open account menu">
                  <span className="mantis-avatar">
                    <CircleUserRound aria-hidden="true" />
                  </span>
                  <span className="mantis-profile-name">{user.firstName}</span>
                  <ChevronDown className="mantis-chevron" aria-hidden="true" />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  align="end"
                  sideOffset={8}
                  className="mantis-admin mantis-dropdown"
                >
                  <Dropdown.Label className="mantis-account-label">
                    <strong>{user.firstName}</strong>
                    <span>{user.tenant?.businessName ?? 'Platform'}</span>
                  </Dropdown.Label>
                  <Dropdown.Separator className="mantis-menu-separator" />
                  <Dropdown.Item className="mantis-menu-item" onSelect={() => void logout()}>
                    <LogOut aria-hidden="true" /> Sign out
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <div className="mantis-content" id="main" tabIndex={-1}>
          <nav className="mantis-breadcrumb" aria-label="Breadcrumb">
            <Link href={homeHref}>Dashboard</Link>
            {current && current.href !== homeHref && (
              <>
                <ChevronRight aria-hidden="true" />
                {pathname === current.href ? (
                  <span aria-current="page">{current.label}</span>
                ) : (
                  <>
                    <Link href={current.href}>{current.label}</Link>
                    <ChevronRight aria-hidden="true" />
                    <span aria-current="page">{pathname.endsWith('/new') ? 'New' : 'Details'}</span>
                  </>
                )}
              </>
            )}
          </nav>
          <div className="mantis-page">{children}</div>
        </div>
      </div>
    </AdminThemeContext.Provider>
  );
}

function Brand({ homeHref }: { homeHref: string }) {
  return (
    <Link href={homeHref} className="mantis-brand" aria-label="EMS Console dashboard">
      <span className="mantis-brand-mark">
        <Boxes aria-hidden="true" />
      </span>
      <span>
        EMS<span className="mantis-brand-caption">Console</span>
      </span>
    </Link>
  );
}

function Sidebar({
  items,
  pathname,
  onNavigate,
}: {
  items: readonly NavigationGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="mantis-navigation" aria-label="Main">
      {items.map((group) => (
        <div key={group.label} className="mantis-nav-group">
          <p className="mantis-nav-caption">{group.label}</p>
          <ul>
            {group.items.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = icons[item.href] ?? LayoutDashboard;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className="mantis-nav-link"
                    title={item.label}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
