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
  /** Icon tile background + icon colour. */
  chip: string;
}

/**
 * The Automark theme is built on two brand colours (violet `primary` / red
 * `secondary`) plus neutrals — not a rainbow palette. Six accent keys are kept (no
 * contract/DB change, so previously-saved content keeps working) but mapped onto
 * tonal variants of those two colours instead of distinct hues.
 */
export const ACCENT_MAP: Record<WebsiteAccentKey, AccentClasses> = {
  indigo: { chip: 'bg-primary/15 text-primary' },
  fuchsia: { chip: 'bg-primary-light/25 text-primary-light' },
  amber: { chip: 'bg-secondary/15 text-secondary' },
  sky: { chip: 'bg-white/10 text-white' },
  emerald: { chip: 'bg-primary/10 text-primary' },
  rose: { chip: 'bg-secondary/10 text-secondary' },
};
