import type { Config } from 'tailwindcss';
import { FONT_STACK_MONO, tailwindFontSize, typeVars } from './src/ui/type';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Not `extend` — this REPLACES Tailwind's default size scale, so text-xs,
    // text-lg and friends simply no longer exist. The old scale is what let
    // twenty font sizes accumulate; leaving it alive alongside the roles would
    // keep two vocabularies in play and nothing to tell them apart.
    fontSize: tailwindFontSize(),
    extend: {
      letterSpacing: {
        // The two display trackings. Roles carry their own tracking; these are
        // for the handful of headings that are deliberately wider than signage.
        signage: '0.2em',
        marquee: '0.3em',
      },
      fontFamily: {
        mono: FONT_STACK_MONO,
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
  plugins: [
    // The scale, reachable from plain CSS as var(--type-body-size) etc, and the
    // one font stack — index.css must not declare its own.
    ({ addBase }: { addBase: (styles: Record<string, Record<string, string>>) => void }) => {
      addBase({
        ':root': typeVars(),
        body: { 'font-family': FONT_STACK_MONO.join(',') },
      });
    },
  ],
} satisfies Config;
