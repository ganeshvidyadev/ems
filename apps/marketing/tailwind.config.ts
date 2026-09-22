import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4338ca',
          foreground: '#ffffff',
          muted: '#6366f1',
        },
        ink: '#0f172a',
        'ink-muted': '#475569',
        surface: '#ffffff',
        'surface-alt': '#f8fafc',
        line: '#e2e8f0',
      },
      maxWidth: {
        content: '72rem',
      },
    },
  },
  plugins: [],
};

export default config;
