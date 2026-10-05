import { describe, expect, it } from "vite-plus/test";
import { optionalEmailSchema } from "./contact";

describe("optionalEmailSchema", () => {
  it.each(["alice@example.com", "alice+market@example.com", "alice.smith@example.com"])(
    "accepts supported address %s",
    (email) => {
      expect(optionalEmailSchema.safeParse(email).success).toBe(true);
    },
  );

  it("trims a valid address", () => {
    expect(optionalEmailSchema.parse("  alice@example.com  ")).toBe("alice@example.com");
  });

  it("accepts a blank email so an enclosing schema can require a phone instead", () => {
    expect(optionalEmailSchema.parse("   ")).toBe("");
  });

  it.each([
    "w..illruddick@gmail.com",
    ".will@example.com",
    "will.@example.com",
    "will@example..com",
    "will@example.com.",
    "will@.example.com",
    "will@-example.com",
    "élise@exemple.fr",
  ])("rejects structurally invalid address %s", (email) => {
    const result = optionalEmailSchema.safeParse(email);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email address");
    }
  });
});
