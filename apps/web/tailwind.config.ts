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
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          bright: 'rgb(var(--gold-bright) / <alpha-value>)',
          dim: 'rgb(var(--gold-dim) / <alpha-value>)',
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
        panel: '0 1px 2px rgb(0 0 0 / 0.28), 0 12px 32px -12px rgb(0 0 0 / 0.45)',
        lifted: '0 2px 4px rgb(0 0 0 / 0.3), 0 24px 48px -16px rgb(0 0 0 / 0.55)',
        gold: '0 0 0 1px rgb(var(--gold) / 0.35), 0 8px 24px -8px rgb(var(--gold) / 0.35)',
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
