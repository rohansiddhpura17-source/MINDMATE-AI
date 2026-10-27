/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          soft: '#EEF2FF',
          border: '#C7D2FE',
          text: '#3730A3',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#0EA5E9',
          hover: '#0284C7',
          soft: '#EFF6FF',
          text: '#1D4ED8',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#7C3AED',
        },
        background: '#F8FAFC',
        surface: '#FFFFFF',
        subtle: '#F1F5F9',
        dark: '#0F172A',
        muted: '#475569',
        border: '#E2E8F0',
        success: {
          DEFAULT: '#047857',
          bg: '#ECFDF5',
          text: '#047857',
          border: '#A7F3D0',
        },
        warning: {
          DEFAULT: '#92400E',
          bg: '#FFFBEB',
          text: '#92400E',
          border: '#FDE68A',
        },
        danger: {
          DEFAULT: '#B91C1C',
          bg: '#FEF2F2',
          text: '#B91C1C',
          border: '#FECACA',
        },
        info: {
          DEFAULT: '#1D4ED8',
          bg: '#EFF6FF',
          text: '#1D4ED8',
          border: '#BFDBFE',
        },
      },
      borderRadius: {
        'card': '12px',
        'btn': '10px',
        'button': '10px',
      },
      boxShadow: {
        'soft': '0 2px 10px -2px rgba(15, 23, 42, 0.06), 0 1px 4px -1px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
}
