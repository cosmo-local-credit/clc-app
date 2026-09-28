import { BackendApiError } from "@clc/api/client/errors";
import { describe, expect, it } from "vite-plus/test";

import {
  type CatalogOwner,
  catalogOwnerFromDetail,
  partitionTokensByIssuer,
} from "./partition-tokens-by-issuer";

const VIEWER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const OTHER = "0x9999999999999999999999999999999999999999";

function token(id: string) {
  return { id, symbol: id.slice(2, 6) };
}

function owners(entries: Array<[string, CatalogOwner]>): Map<string, CatalogOwner> {
  return new Map(entries);
}

describe("catalogOwnerFromDetail", () => {
  it("treats a catalog miss as not issued, and any other error as unresolved", () => {
    expect(
      catalogOwnerFromDetail({
        isPending: false,
        isError: true,
        error: new BackendApiError(404, "missing"),
      }),
    ).toEqual({ state: "missing" });
    expect(
      catalogOwnerFromDetail({
        isPending: false,
        isError: true,
        error: new BackendApiError(500, "down"),
      }),
    ).toEqual({ state: "failed" });
    expect(
      catalogOwnerFromDetail({
        isPending: true,
        isError: false,
        error: null,
      }),
    ).toEqual({ state: "pending" });
  });
});

describe("partitionTokensByIssuer", () => {
  const issued = token("0xaaa0000000000000000000000000000000000001");
  const held = token("0xbbb0000000000000000000000000000000000002");
  const unknown = token("0xccc0000000000000000000000000000000000003");

  it("puts the viewer's vouchers after everyone else's and keeps each group's order", () => {
    const split = partitionTokensByIssuer(
      [held, issued, unknown],
      owners([
        [held.id, { state: "known", ownerAddress: OTHER }],
        [issued.id, { state: "known", ownerAddress: VIEWER.toUpperCase() }],
        [unknown.id, { state: "missing" }],
      ]),
      VIEWER,
    );

    expect(split.holdings.map((row) => row.id)).toEqual([held.id, unknown.id]);
    expect(split.issued.map((row) => row.id)).toEqual([issued.id]);
    expect(split.pending).toBe(false);
    expect(split.failed).toBe(false);
  });

  it("holds a row out of both lists while its owner is unknown or the read failed", () => {
    const waiting = partitionTokensByIssuer(
      [issued, held],
      owners([
        [issued.id, { state: "pending" }],
        [held.id, { state: "known", ownerAddress: OTHER }],
      ]),
      VIEWER,
    );
    expect(waiting.holdings.map((row) => row.id)).toEqual([held.id]);
    expect(waiting.issued).toEqual([]);
    expect(waiting.pending).toBe(true);

    const broken = partitionTokensByIssuer(
      [issued],
      owners([[issued.id, { state: "failed" }]]),
      VIEWER,
    );
    expect(broken.holdings).toEqual([]);
    expect(broken.issued).toEqual([]);
    expect(broken.failed).toBe(true);
  });

  it("does not call a voucher issued when the viewer is unknown or the catalog has no owner", () => {
    const known = owners([[issued.id, { state: "known", ownerAddress: VIEWER }]]);
    expect(partitionTokensByIssuer([issued], known, undefined).issued).toEqual([]);
    expect(partitionTokensByIssuer([issued], known, undefined).holdings).toEqual([issued]);

    const unowned = owners([[issued.id, { state: "known", ownerAddress: null }]]);
    expect(partitionTokensByIssuer([issued], unowned, VIEWER).holdings).toEqual([issued]);
  });
});
