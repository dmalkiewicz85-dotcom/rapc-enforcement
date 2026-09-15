/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Placeholder palette until the HOA supplies a logo/colours (docs/TODO.md).
      colors: {
        ink: {
          50: '#f8f9fa', 100: '#eef0f2', 200: '#cfd4da', 300: '#aab2bb', 400: '#848e99',
          500: '#626c78', 600: '#4d5560', 700: '#3a414a', 800: '#272c33', 900: '#161a1f',
        },
        brand: {
          50: '#eef5f1', 100: '#d6e7dd', 200: '#a8cdb8', 300: '#78b092', 400: '#4f9470',
          500: '#347a57', 600: '#296246', 700: '#204c37', 800: '#173628', 900: '#0f231a',
        },
      },
    },
  },
  plugins: [],
}
