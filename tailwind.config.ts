import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        /** Classmates / Discover — blues for CTAs & chips, teal for social “link”, warm surfaces */
        /** Product surface + ink — Profile, Discover cards, inbox (light). */
        classmates: {
          blue: "#2563EB",
          "blue-soft": "#EFF6FF",
          "blue-border": "#BFDBFE",
          "blue-heading": "#1E3A8A",
          "blue-body": "#1E40AF",
          teal: "#0F766E",
          "teal-soft": "#F0FDFA",
          "teal-border": "#99F6E4",
          warm: "#F8F7F4",
          "warm-alt": "#FAF9F6",
          surface: "#FFFFFF",
          edge: "#E7E0D6",
          hairline: "#EFECE6",
          rail: "#E6E3DC",
          ink: "#111827",
          sub: "#5F6B7A",
          hint: "#8A94A6",
          success: "#059669",
          "success-soft": "#ECFDF5",
          /** Bottom nav active pill (not in base spec; harmonizes with warm page). */
          mint: "#E8F1F0",
          /** Soft focus border on inputs (blue-300). */
          azure: "#93C5FD",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 14px 40px -20px rgba(15, 23, 42, 0.22)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
