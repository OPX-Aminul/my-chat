import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        night: {
          950: "#070B14",
          900: "#0B1220",
          850: "#0F172A",
          800: "#131C31",
          700: "#1C2A44",
        },
        brand: {
          cyan: "#22D3EE",
          indigo: "#6366F1",
          amber: "#F59E0B",
          rose: "#F43F5E",
          green: "#34D399",
        },
      },
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(34,211,238,0.45)",
        panel: "0 8px 32px rgba(2,6,23,0.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
