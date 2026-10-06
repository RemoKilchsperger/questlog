import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Unter Windows stürzt der Dateiwächter ab (EBUSY), wenn ein Bild beim
    // Speichern noch gesperrt ist. Abfragen statt Beobachten vermeidet das.
    watch: { usePolling: true, interval: 300 },
  },
});
