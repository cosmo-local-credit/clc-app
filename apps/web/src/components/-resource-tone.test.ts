import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { POST_RESOURCE_HUE, RESOURCE_HUE } from "./resource-tone";

describe("resource tones", () => {
  it("shares green between Vouchers and Offers and keeps every other resource distinct", () => {
    expect(RESOURCE_HUE.vouchers).toContain("--color-voucher");
    expect(RESOURCE_HUE.offers).toContain("--color-offer");
    expect(RESOURCE_HUE.wants).toContain("--color-want");
    expect(RESOURCE_HUE.pools).toContain("--color-pool");
    expect(RESOURCE_HUE.catalogs).toContain("--color-catalog");
    expect(POST_RESOURCE_HUE).toContain("--color-post");

    const css = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles.css"),
      "utf8",
    );
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(root).toContain("--voucher: #007a55");
    expect(root).toContain("--offer: #007a55");
    expect(root).toContain("--want: #ea580c");
    expect(root).toContain("--pool: #125a98");
    expect(root).toContain("--catalog: #7c3aed");
    expect(root).toContain("--post: #52525b");
  });
});
