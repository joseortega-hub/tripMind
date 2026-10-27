// Copia el worker de MapLibre a `public/`: Turbopack no empaqueta el worker que MapLibre 6 carga
// con `import.meta.url`, así que se sirve como archivo estático (ver `trip-map.tsx`).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(dist, "dist/maplibre-gl-worker.mjs"), "public/vendor/maplibre-gl-worker.mjs");
