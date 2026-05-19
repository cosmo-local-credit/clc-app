import { describe, expect, it } from "vitest";
import { getFieldError } from "./index";

describe("getFieldError", () => {
	it("returns null for an empty array", () => {
		expect(getFieldError([])).toBeNull();
	});

	it("returns a plain string error", () => {
		expect(getFieldError(["required"])).toBe("required");
	});

	it("extracts message from a StandardSchemaV1Issue", () => {
		expect(getFieldError([{ message: "too short", path: [] }])).toBe(
			"too short",
		);
	});

	it("skips leading undefined entries", () => {
		expect(getFieldError([undefined, "must be valid"])).toBe("must be valid");
	});
});
