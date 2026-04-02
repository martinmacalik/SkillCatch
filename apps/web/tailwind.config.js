/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "ui-sans-serif", "system-ui"],
        serif: ["Literata", "ui-serif", "Georgia"],
      },
      gridTemplateColumns: {
        '9': 'repeat(9, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
}
