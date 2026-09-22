import { Boxes, Gauge, Globe, Lock, Package, Rocket, ShieldCheck, ShoppingCart, Star, Users, Zap, BarChart3, type LucideIcon } from 'lucide-react';
import type { WebsiteAccentKey, WebsiteIconKey } from '@ems/contracts';

/**
 * Fixed lookup tables from the closed `WebsiteIconKey`/`WebsiteAccentKey` unions to
 * literal Lucide components and Tailwind class strings. Tailwind's JIT compiler only
 * generates classes it sees literally in source at build time, so a DB-supplied class
 * string would silently render unstyled — this table is what keeps admin-entered
 * content safe to style.
 */
export const ICON_MAP: Record<WebsiteIconKey, LucideIcon> = {
  users: Users,
  cart: ShoppingCart,
  gauge: Gauge,
  globe: Globe,
  shield: ShieldCheck,
  boxes: Boxes,
  zap: Zap,
  lock: Lock,
  rocket: Rocket,
  chart: BarChart3,
  package: Package,
  star: Star,
};

export interface AccentClasses {
  chip: string;
  gradient: string;
  check: string;
}

export const ACCENT_MAP: Record<WebsiteAccentKey, AccentClasses> = {
  indigo: { chip: 'bg-indigo-100 text-indigo-600', gradient: 'from-indigo-600 to-indigo-400', check: 'text-indigo-600' },
  fuchsia: {
    chip: 'bg-fuchsia-100 text-fuchsia-600',
    gradient: 'from-indigo-600 to-fuchsia-600',
    check: 'text-fuchsia-600',
  },
  amber: { chip: 'bg-amber-100 text-amber-600', gradient: 'from-amber-500 to-orange-500', check: 'text-amber-600' },
  sky: { chip: 'bg-sky-100 text-sky-600', gradient: 'from-sky-500 to-sky-400', check: 'text-sky-600' },
  emerald: {
    chip: 'bg-emerald-100 text-emerald-600',
    gradient: 'from-emerald-500 to-emerald-400',
    check: 'text-emerald-600',
  },
  rose: { chip: 'bg-rose-100 text-rose-600', gradient: 'from-rose-500 to-rose-400', check: 'text-rose-600' },
};
