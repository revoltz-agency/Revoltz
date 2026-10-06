import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // "ink" = the dark SaaS surface palette
        ink: {
          950: '#05070d',
          900: '#080b14',
          850: '#0b0f1a',
          800: '#0f1422',
          750: '#131a2b',
          700: '#1a2236',
          600: '#26304a',
          500: '#3a4666',
          400: '#5f6d8f',
          300: '#8d9ab8',
          200: '#bcc6da',
          100: '#e6ebf5',
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bdd0ff',
          300: '#90b0ff',
          400: '#5f85fb',
          500: '#3d63f0',
          600: '#2745d6',
          700: '#2136ab',
          800: '#1f3086',
          900: '#1e2d6a',
        },
        accent: {
          DEFAULT: '#22d3ee',
          soft: '#67e8f9',
        },
        priority: {
          high: '#fb7185',
          medium: '#fbbf24',
          low: '#94a3b8',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Inter',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(63,99,240,0.35), 0 12px 40px -12px rgba(63,99,240,0.45)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)',
        'brand-gradient': 'linear-gradient(135deg, #3d63f0 0%, #22d3ee 100%)',
        'panel-sheen': 'radial-gradient(1200px 400px at 10% -10%, rgba(61,99,240,0.18), transparent 60%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
