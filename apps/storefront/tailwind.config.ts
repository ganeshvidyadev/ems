import type { Config } from 'tailwindcss';

/**
 * Storefront theme.
 *
 * Every token is a CSS custom property whose *value* is injected per request from
 * the tenant's published theme. This is the mechanism that makes merchant colour
 * and font customisation possible without a build per tenant — a Tailwind build per
 * store would not scale past a few hundred stores and would make a colour change a
 * deploy (docs/01 §12).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Resolved at request time from `tenant_themes`; the fallbacks keep an
        // unthemed or mid-provisioning store renderable rather than unstyled.
        brand: {
          DEFAULT: 'var(--brand, #111827)',
          foreground: 'var(--brand-foreground, #ffffff)',
          muted: 'var(--brand-muted, #6b7280)',
        },
        surface: 'var(--surface, #ffffff)',
        'surface-alt': 'var(--surface-alt, #f9fafb)',
        ink: 'var(--ink, #111827)',
        'ink-muted': 'var(--ink-muted, #6b7280)',
        line: 'var(--line, #e5e7eb)',
        sale: 'var(--sale, #dc2626)',
      },
      fontFamily: {
        heading: ['var(--font-heading, system-ui)', 'sans-serif'],
        body: ['var(--font-body, system-ui)', 'sans-serif'],
      },
      borderRadius: {
        theme: 'var(--radius, 0.5rem)',
      },
      maxWidth: {
        content: 'var(--content-width, 80rem)',
      },
    },
  },
  plugins: [],
};

export default config;
