import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefdf6',
          500: '#0f9d6b',
          600: '#0b7d55',
          700: '#0a6244',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
