import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Existing app-wide palette - used throughout the authenticated
        // product (login/admin/manager/operator/client-panel/hunter).
        // Deliberately left untouched by the marketing-site redesign; see
        // `ink`/`paper`/`accent` below for the public site's own tokens.
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b9d0ff',
          400: '#5b82ef',
          500: '#3563e9',
          600: '#2a4fc4',
          700: '#233f9c',
          900: '#182a68',
        },
        // Marketing-site-only design tokens (public pages: /, /services,
        // /how-it-works, /about, /careers, /contact). A warm near-black
        // foundation + warm-neutral surface, deliberately distinct from the
        // cold slate/light-blue look of a generic SaaS template.
        ink: {
          DEFAULT: '#0B0D12', // primary dark surface (hero, CTA blocks, footer)
          800: '#14161D',
          700: '#1D2029',
        },
        paper: {
          DEFAULT: '#FAFAF8', // page background
          surface: '#FFFFFF', // elevated card surface
          border: '#E7E5E0',
        },
        graphite: {
          DEFAULT: '#16171C', // primary text on light
          secondary: '#54555F',
          muted: '#8B8C93',
        },
        // A single disciplined accent - a deepened, more confident indigo
        // than the app's lighter brand-500, used sparingly (primary CTA,
        // key numerals, active states) rather than as a background wash.
        accent: {
          50: '#EEF0FF',
          100: '#DEE2FE',
          400: '#5B62E8',
          500: '#3D3FDB',
          600: '#3230B3',
          700: '#282690',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        panel: '0 4px 16px -4px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
        elevated: '0 8px 30px -8px rgb(11 13 18 / 0.18), 0 2px 8px -2px rgb(11 13 18 / 0.08)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        dash: {
          to: { strokeDashoffset: '-18' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.5s ease-out both',
      },
    },
  },
  plugins: [],
}
export default config
