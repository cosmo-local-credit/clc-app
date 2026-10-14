import { describe, expect, it } from "vite-plus/test";
import { profileEditSchema, profileSchema, usernameSchema } from "./logic";

const VALID_LOCATION = {
  lat: -1.2921,
  lng: 36.8219,
  locationName: "Nairobi, Kenya",
  country: "KE",
};

const VALID_BASE = {
  name: "Alice",
  email: "alice@example.com",
  phone: "",
  location: VALID_LOCATION,
  preferredCurrency: "KES",
  bio: "Neighbourhood organiser",
  website: "https://alice.example",
};

describe("profileSchema", () => {
  it("accepts a fully populated object", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        phone: "+254712345678",
      }).success,
    ).toBe(true);
  });

  it("accepts name + email + location (no phone)", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, phone: "" }).success).toBe(true);
  });

  it("accepts name + phone + location (no email)", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        email: "",
        phone: "+254712345678",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = profileSchema.safeParse({ ...VALID_BASE, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/required/i);
    }
  });

  it("rejects a name longer than 80 characters", () => {
    const result = profileSchema.safeParse({
      ...VALID_BASE,
      name: "a".repeat(81),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/80/);
    }
  });

  it("accepts a name of exactly 80 characters", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, name: "a".repeat(80) }).success).toBe(true);
  });

  it("rejects a missing location with a user-facing message", () => {
    const result = profileSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      phone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Choose a location");
    }
  });

  it("rejects an invalid location country code", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        location: { ...VALID_LOCATION, country: "KEN" },
      }).success,
    ).toBe(false);
  });

  it("rejects when both email and phone are empty", () => {
    const result = profileSchema.safeParse({
      ...VALID_BASE,
      email: "",
      phone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => /email|phone/i.test(m))).toBe(true);
    }
  });

  it("passes when only email is provided", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        phone: "",
      }).success,
    ).toBe(true);
  });

  it("passes when only phone is provided", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        email: "",
        phone: "+254712345678",
      }).success,
    ).toBe(true);
  });

  it("passes when both email and phone are provided", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        phone: "+254712345678",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an email without a domain", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, email: "alice@" }).success).toBe(false);
  });

  it("accepts a valid E.164 phone number", () => {
    expect(
      profileSchema.safeParse({
        ...VALID_BASE,
        email: "",
        phone: "+254712345678",
      }).success,
    ).toBe(true);
  });

  it("rejects a phone without a leading +", () => {
    expect(
      profileSchema.safeParse({
        name: "Alice",
        email: "",
        phone: "0712345678",
        location: VALID_LOCATION,
      }).success,
    ).toBe(false);
  });

  it("rejects a phone with non-digits after the +", () => {
    expect(
      profileSchema.safeParse({
        name: "Alice",
        email: "",
        phone: "+abc12345",
        location: VALID_LOCATION,
      }).success,
    ).toBe(false);
  });
});

describe("profileEditSchema", () => {
  it("allows an existing location to be cleared", () => {
    expect(
      profileEditSchema.safeParse({
        ...VALID_BASE,
        location: undefined,
      }).success,
    ).toBe(true);
  });

  it("accepts blank optional bio and website values", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, bio: "", website: "" }).success).toBe(true);
  });

  it("rejects a currency outside the ISO catalog", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, preferredCurrency: "HOUR" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed website and an overlong bio", () => {
    expect(profileSchema.safeParse({ ...VALID_BASE, website: "alice.example" }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ ...VALID_BASE, bio: "a".repeat(501) }).success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("normalizes manual names and allows deferred assignment", () => {
    expect(usernameSchema.parse("  Sohail-1  ")).toBe("Sohail-1");
    expect(usernameSchema.parse("  ")).toBe("");
    expect(profileSchema.safeParse({ ...VALID_BASE }).success).toBe(true);
  });

  it.each([
    "A",
    "123456",
    "-alice",
    "alice-",
    "alice.eth",
    "Alice Smith",
    "Željko",
    "李明",
    "سُهيل",
    "Тијана",
    "👩🏽‍🌾",
  ])("accepts display-name username %s", (username) =>
    expect(usernameSchema.parse(username)).toBe(username),
  );
  it("normalizes accents and counts Unicode code points", () => {
    expect(usernameSchema.parse(" Jose\u0301 ")).toBe("José");
    expect(usernameSchema.safeParse("😀".repeat(80)).success).toBe(true);
    expect(usernameSchema.safeParse("😀".repeat(81)).success).toBe(false);
  });
});
