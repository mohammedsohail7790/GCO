import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          500: '#3563e9',
          600: '#2a4fc4',
          700: '#233f9c',
        },
      },
    },
  },
  plugins: [],
}
export default config
