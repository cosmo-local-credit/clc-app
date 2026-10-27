/** Run from the repository root after `vp test --coverage`. */
import { prepareCoverage } from "./coverage.ts";

prepareCoverage(process.cwd());
console.log("Verified workspace coverage; prepared independent web and core LCOV reports.");
