import { describe, expect, it } from "vite-plus/test";
import { declaredNotificationKinds, sameDeclaredKinds } from "./declared-kinds";

describe("declaredNotificationKinds", () => {
  it("declares nothing until a worker has said what it parses", () => {
    expect(declaredNotificationKinds(null)).toBeUndefined();
    expect(declaredNotificationKinds({})).toBeUndefined();
  });

  it("declares the kinds both this page and the active worker parse", () => {
    expect(
      declaredNotificationKinds({
        workerKinds: ["voucher.received", "offramp.completed", "message.received", "future.kind"],
      }),
    ).toEqual(["voucher.received", "offramp.completed", "message.received"]);
  });
});

describe("sameDeclaredKinds", () => {
  it("compares as sets and treats undeclared as its own value", () => {
    expect(sameDeclaredKinds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameDeclaredKinds(["a"], ["a", "b"])).toBe(false);
    expect(sameDeclaredKinds(undefined, undefined)).toBe(true);
    expect(sameDeclaredKinds(undefined, [])).toBe(false);
  });
});
