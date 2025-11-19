/** @type {import('tailwindcss').Config} */
module.exports = {
  // In Tailwind v4, configuration is primarily done in CSS using @theme
  // This file is kept minimal for content paths and plugins
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [require("tailwindcss-animate")],
};
