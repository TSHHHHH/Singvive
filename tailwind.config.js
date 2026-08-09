/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // apocalyptic palette
        rot: {
          50: '#f3f5f0',
          900: '#12160f',
        },
        blood: '#8b1e1e',
        toxic: '#6b8e23',
      },
    },
  },
  plugins: [],
};
