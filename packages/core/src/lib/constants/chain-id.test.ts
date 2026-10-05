import { describe, expect, it } from "vite-plus/test";
import { resolveChainId } from "./chain-id";

describe("resolveChainId", () => {
  it("defaults an unset variable to Gnosis", () => {
    expect(resolveChainId(undefined)).toBe(100);
  });

  it("reads a configured chain", () => {
    expect(resolveChainId("42220")).toBe(42220);
  });
});
