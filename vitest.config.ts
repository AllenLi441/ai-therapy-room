import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      // Prefix form reliably rewrites "@/lib/foo" → "<root>/src/lib/foo".
      "@/": fileURLToPath(new URL("./src/", import.meta.url))
    }
  }
});
