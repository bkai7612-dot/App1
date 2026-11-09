import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#08070D", 2: "#100D19", card: "#171322", line: "#2A2340" },
        violet: { brand: "#8B5CF6", electric: "#A855F7", lavender: "#C4B5FD" },
        text: { DEFAULT: "#F5F3FF", muted: "#A8A2B8" },
        pos: { DEFAULT: "#34D399", soft: "#10B98122" },
        neg: { DEFAULT: "#F87171", soft: "#EF444422" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,.25), 0 8px 40px -12px rgba(139,92,246,.45)",
        card: "0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.8)",
      },
    },
  },
  plugins: [],
} satisfies Config;
