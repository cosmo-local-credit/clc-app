/**
 * Bundle budget check for the admin console.
 *
 * Two things are asserted, both of which the architecture plan calls for and
 * neither of which a typecheck or test can catch:
 *
 * 1. Chart code stays in the route that charts. Recharts is the single largest
 *    dependency here; if it leaks into the layout chunk, every list route pays
 *    ~100 KB gzip to render a table.
 * 2. No chunk grows more than the allowed margin over its recorded baseline.
 *
 * Run after `vp build`. Budgets live in bundle-budget.json beside this script;
 * update them deliberately, with the reason in the commit message.
 */

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const budgetPath = join(here, "bundle-budget.json");

/**
 * Both build shapes are inspected, because they are not the same artifact.
 * `vp build` emits the Nitro server layout under .output/public, while
 * `build:cf` (NITRO_PRESET=cloudflare-pages) emits dist/ — and dist/ is what
 * Cloudflare Pages serves. Looking only in .output meant this check could not see
 * the bundle that actually ships.
 */
const candidateAssetDirs = [
  join(here, "..", "dist", "assets"),
  join(here, "..", ".output", "public", "assets"),
];

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const tolerance = budget.tolerance ?? 0.1;

let assets;
let files;
for (const candidate of candidateAssetDirs) {
  try {
    files = readdirSync(candidate).filter((name) => name.endsWith(".js"));
    assets = candidate;
    break;
  } catch {
    // Try the next layout.
  }
}

if (!assets) {
  console.error(
    `No build output found. Looked in:\n${candidateAssetDirs.map((d) => `  ${d}`).join("\n")}\n` +
      "Run `vp build` or `pnpm build:cf` first.",
  );
  process.exit(2);
}
console.log(`Measuring ${assets}`);

/** Content hashes change every build, so chunks are matched by their stable prefix. */
function groupOf(name) {
  return name.replace(/-[A-Za-z0-9_-]{8,}\.js$/, "");
}

const chunks = files.map((name) => {
  const bytes = readFileSync(join(assets, name));
  return {
    name,
    group: groupOf(name),
    gzip: gzipSync(bytes).length,
    source: bytes.toString("utf8"),
  };
});

function importsChunk(source, name) {
  return source.includes(`./${name}`);
}

function isChartRouteOrDependency(chunk, visiting = new Set()) {
  if (budget.chartChunks.some((allowed) => chunk.source.includes(allowed))) return true;
  if (visiting.has(chunk.name)) return false;

  const nextVisiting = new Set(visiting).add(chunk.name);
  const importers = chunks.filter(
    (candidate) => candidate.name !== chunk.name && importsChunk(candidate.source, chunk.name),
  );
  return (
    importers.length > 0 &&
    importers.every((importer) => isChartRouteOrDependency(importer, nextVisiting))
  );
}

const failures = [];

// 1. Chart isolation. Charts are optional on the dashboard; if Recharts is
// present it must stay in a chart route and must not leak into the shell.
const withCharts = chunks.filter((chunk) => chunk.source.includes("recharts"));
for (const chunk of withCharts) {
  if (!isChartRouteOrDependency(chunk)) {
    failures.push(
      `${chunk.name} contains Recharts outside the permitted chart-route import graph. ` +
        "Chart code must not enter the layout or a list route.",
    );
  }
}
// 2. Size budgets.
const measured = {};
for (const chunk of chunks) {
  measured[chunk.group] = Math.max(measured[chunk.group] ?? 0, chunk.gzip);
}
for (const [group, baseline] of Object.entries(budget.chunks)) {
  const actual = measured[group];
  if (actual === undefined) {
    failures.push(`Budgeted chunk "${group}" is missing from the build.`);
    continue;
  }
  const ceiling = Math.round(baseline * (1 + tolerance));
  if (actual > ceiling) {
    const pct = Math.round(((actual - baseline) / baseline) * 100);
    failures.push(
      `${group} is ${(actual / 1024).toFixed(1)} KB gzip, ${pct}% over its ` +
        `${(baseline / 1024).toFixed(1)} KB baseline (ceiling ${(ceiling / 1024).toFixed(1)} KB).`,
    );
  }
}

const summary = Object.entries(measured)
  .filter(([, size]) => size > 20_000)
  .sort(([, a], [, b]) => b - a)
  .map(([group, size]) => `  ${group.padEnd(28)} ${(size / 1024).toFixed(1)} KB gzip`)
  .join("\n");

if (failures.length > 0) {
  console.error("Bundle budget failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nMeasured:\n${summary}`);
  process.exit(1);
}

console.log(`Bundle budget passed.\n${summary}`);
