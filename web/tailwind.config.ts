import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecdff",
          400: "#59b0ff",
          500: "#338fff",
          600: "#1b6ff5",
          700: "#1458e1",
          800: "#1748b6",
          900: "#19408f",
        },
        ink: {
          900: "#0b1220",
          800: "#111a2c",
          700: "#1a2438",
          600: "#2a3852",
        },
        // Tokens del panel admin (look & feel AdminLTE 3/4). La Suite pública
        // conserva `brand` e `ink`; estos colores solo afectan a /admin.
        adminlte: {
          primary: "#007bff",       // acción principal, enlaces activos
          primaryDark: "#0062cc",   // hover/active
          info: "#17a2b8",
          success: "#28a745",
          warning: "#ffc107",
          danger: "#dc3545",
          sidebar: "#343a40",       // fondo del sidebar (dark)
          sidebarHover: "#4b545c",
          sidebarText: "#c2c7d0",
          sidebarActive: "#007bff",
          content: "#f4f6f9",       // fondo del área de contenido
          card: "#ffffff",
          border: "#dee2e6",
          text: "#212529",
          muted: "#6c757d",
        },
      },
      boxShadow: {
        // Sombra de tarjeta AdminLTE (card)
        "adminlte-card": "0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
