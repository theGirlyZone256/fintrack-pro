/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        premium: {
          black: '#0A0A0A',
          white: '#FAFAFA',
          gray: '#171717',
        }
      }
    },
  },
  plugins: [],
}