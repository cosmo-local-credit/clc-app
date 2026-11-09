import { describe, expect, it } from "vite-plus/test";
import { declaredNotificationKinds, sameDeclaredKinds } from "./declared-kinds";
import { NOTIFICATION_KINDS } from "./payload-schema";

describe("declaredNotificationKinds", () => {
  it("declares nothing until a worker has said what it parses", () => {
    expect(declaredNotificationKinds(null)).toBeUndefined();
    expect(declaredNotificationKinds({})).toBeUndefined();
  });

  it("declares the full set once this build's worker is active", () => {
    expect(declaredNotificationKinds({ workerKinds: [...NOTIFICATION_KINDS].reverse() })).toEqual(
      NOTIFICATION_KINDS,
    );
  });

  it("declares nothing while a worker from another build is active, and never an empty list", () => {
    expect(
      declaredNotificationKinds({ workerKinds: [...NOTIFICATION_KINDS, "future.kind"] }),
    ).toBeUndefined();
    expect(declaredNotificationKinds({ workerKinds: ["voucher.received"] })).toBeUndefined();
    expect(declaredNotificationKinds({ workerKinds: [] })).toBeUndefined();
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
