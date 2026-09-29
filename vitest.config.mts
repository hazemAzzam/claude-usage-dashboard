import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pin the timezone: summarize() buckets by LOCAL day/hour and computes the
// previous window in local calendar days, so results depend on TZ. A DST zone
// is chosen deliberately so the DST-straddling test is meaningful everywhere.
// Set here (before workers fork) so they inherit it.
process.env.TZ = "America/New_York";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // lib/usage.ts starts with `import "server-only"`, which throws outside
      // a Next server bundle. Aliasing it to an empty module lets the pure
      // summarize() be unit-tested in plain Node.
      "server-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
    },
  },
  test: { include: ["lib/**/*.test.ts"] },
});
