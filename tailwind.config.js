/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // One type scale for the whole HUD. Everything picks a step here;
      // no ad-hoc text-[Npx] anywhere. 2xs is the smallest legible step —
      // meter readouts, stat chips, timestamps.
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Brutalist-bureau palette: poured concrete, bureau ochre, hiss red.
        concrete: {
          50: '#e8e5dd', // signage off-white
          200: '#b7b3a9',
          400: '#6f6d68',
          600: '#3a3a3c',
          800: '#1c1c1e',
          900: '#111112', // panel ground
          950: '#08080a', // page ground
        },
        // The bureau prints in black and white. Colour is reserved for
        // exactly two things: danger (red) and live telemetry (cyan).
        signal: '#e8e5dd', // signage white — the primary action colour
        hiss: '#d92d2d', // the resonance red, danger only
        astral: '#2bc4d9', // terminal cyan, live readouts only
      },
      // Bureau terminal: near-square corners. Soft SaaS radii collapse to 0–2px;
      // rounded-full stays for intentional circular dots only.
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
        '3xl': '2px',
      },
      boxShadow: {
        // Hard frame first; depth is a tight drop, not a soft card float.
        signage: '0 0 0 1px rgba(232,229,221,0.28), 0 8px 24px -10px rgba(0,0,0,0.95)',
      },
    },
  },
  plugins: [],
};
