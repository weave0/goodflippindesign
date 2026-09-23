import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4177,
    strictPort: true,
  },
  preview: {
    port: 4177,
    strictPort: true,
  },
  build: {
    // Production sourcemaps would publish LocalDevPreview source even though DEV code is dead-stripped.
    sourcemap: false,
    target: "es2022",
  },
});
