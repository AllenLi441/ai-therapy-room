import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["eval/rag-independent/*.test.ts"] },
  resolve: { alias: { "@/": fileURLToPath(new URL("../../src/", import.meta.url)) } },
});
