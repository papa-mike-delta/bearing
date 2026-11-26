import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const path = "public/bearing-sw.js";
const source = readFileSync(path, "utf8").replace(
  /const CACHE = "bearing-offline-[^"]+";/,
  'const CACHE = "bearing-offline-VERSION";',
);
const hash = createHash("sha256").update(source);
for (const file of [
  "offline.html",
  "bearing-offline.css",
  "bearing-offline.js",
  "bearing-outbox.js",
  "logo.svg",
])
  hash.update(readFileSync(`public/${file}`));
writeFileSync(
  path,
  source.replace(
    "bearing-offline-VERSION",
    `bearing-offline-${hash.digest("hex").slice(0, 12)}`,
  ),
);
