import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * The design system is expressed as CSS custom properties in globals.css and
 * surfaced here as Tailwind tokens. That indirection is what lets a restaurant
 * re-theme the customer menu (accent colour, light/dark) at runtime without a
 * rebuild.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--ink-subtle) / <alpha-value>)',
          inverse: 'rgb(var(--ink-inverse) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          bright: 'rgb(var(--brand-bright) / <alpha-value>)',
          dim: 'rgb(var(--brand-dim) / <alpha-value>)',
        },
        positive: 'rgb(var(--positive) / <alpha-value>)',
        caution: 'rgb(var(--caution) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-vazirmatn)', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        /*
         * Cast in `--shadow`, which each mode sets: a near-black wash on the
         * paper canvas and true black in dark mode. A shadow tuned for charcoal
         * looks like dirt on white.
         */
        panel:
          '0 1px 2px rgb(var(--shadow) / 0.05), 0 8px 24px -12px rgb(var(--shadow) / 0.12)',
        lifted:
          '0 2px 6px rgb(var(--shadow) / 0.07), 0 20px 44px -16px rgb(var(--shadow) / 0.18)',
        brand:
          '0 0 0 1px rgb(var(--brand) / 0.25), 0 8px 24px -10px rgb(var(--brand) / 0.30)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--caution) / 0.5)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--caution) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--caution) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.22s ease-out',
        'scale-in': 'scale-in 0.18s ease-out',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
    },
  },
  plugins: [forms({ strategy: 'class' })],
};

export default config;
