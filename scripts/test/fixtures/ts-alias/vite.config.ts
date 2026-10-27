// The alias is declared once, in tsconfig.json `paths`. Vite reads it natively for the dev server
// and the production build, and Vitest inherits it from this config. No duplicated alias map.
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    lib: { entry: "src/main.ts", formats: ["es"], fileName: "main" },
  },
});
