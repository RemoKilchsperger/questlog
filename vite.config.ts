import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Eigene JSX-Laufzeit: ersetzt Emojis im Text durch Pixel-Icons (src/jsx/transform.ts)
  plugins: [react({ jsxImportSource: "questlog-jsx" }), tailwindcss()],
  resolve: { alias: { "questlog-jsx": "/src/jsx" } },
  // Liegt im Projekt – nicht als Paket vorbündeln, sonst greifen Änderungen erst nach einem Cache-Leeren
  optimizeDeps: { exclude: ["questlog-jsx/jsx-runtime", "questlog-jsx/jsx-dev-runtime"] },
  server: {
    // Unter Windows stürzt der Dateiwächter ab (EBUSY), wenn ein Bild beim
    // Speichern noch gesperrt ist. Abfragen statt Beobachten vermeidet das.
    watch: { usePolling: true, interval: 300 },
  },
});
