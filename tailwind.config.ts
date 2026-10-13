import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        field: { 50: "#EEF5EA", 100: "#DCEBD3", 200: "#BDD8AE", 600: "#2F6B3E", 700: "#235330", 800: "#1A4026" },
        turmeric: { 400: "#F2B705", 500: "#E5A100", 600: "#C98A00" },
        ink: { DEFAULT: "#1C2733", soft: "#475467" },
        paper: "#F6F9F1",
        rule: "#D5DEC8",
        chili: { 50: "#FDECEA", 700: "#B3261E" },
        sky: { 50: "#E8F1FA", 700: "#1F5C99" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-kn)", "system-ui", "sans-serif"],
      },
      minHeight: { touch: "48px" },
      minWidth: { touch: "48px" },
    },
  },
  plugins: [],
};
export default config;
