/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        // provide a zinc alias if the Tailwind version doesn't include it
        zinc: colors?.zinc || colors?.gray,
      }
    },
  },
  plugins: [],
};
