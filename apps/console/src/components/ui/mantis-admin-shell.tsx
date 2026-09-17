'use client';

import type { UserSummary } from '@ems/contracts';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Activity,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  DatabaseBackup,
  Gauge,
  Bell,
  Building2,
  Landmark,
  Receipt,
  HeartPulse,
  History,
  BarChart3,
  Settings,
  UserCog,
  LayoutDashboard,
  LayoutList,
  Paintbrush,
  LifeBuoy,
  LogOut,
  Menu,
  Monitor,
  Package,
  Palette,
  PanelLeftClose,
  ScrollText,
  ShoppingBag,
  ListTodo,
  Tag,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AdminThemeContext } from './admin-theme';

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
  '/support': LifeBuoy,
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
};

/** All state here controls presentation. Navigation and account actions are supplied by the app. */
export function MantisAdminShell({
  user,
  pathname,
  items,
  homeHref = '/',
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
      <div className="mantis-admin mantis-shell" data-collapsed={collapsed}>
        <a className="mantis-skip" href="#main">
          Skip to content
        </a>
        <aside className="mantis-sidebar" aria-label="Admin sidebar" id="admin-sidebar">
          <Brand homeHref={homeHref} />
          <Sidebar items={items} pathname={pathname} />
          <div className="mantis-sidebar-footer">
            EMS Console<span>Super Admin</span>
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
          <span className="mantis-topbar-title">EMS Console</span>
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
