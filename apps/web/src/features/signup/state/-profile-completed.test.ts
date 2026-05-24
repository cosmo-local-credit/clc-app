import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearProfileCompleted,
	getProfileCompleted,
	markProfileCompleted,
} from "./profile-completed";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

describe("profile-completed flag", () => {
	it("returns false before anything is stored", () => {
		expect(getProfileCompleted()).toBe(false);
	});

	it("returns true after markProfileCompleted", () => {
		markProfileCompleted();
		expect(getProfileCompleted()).toBe(true);
	});

	it("returns false after clearProfileCompleted", () => {
		markProfileCompleted();
		clearProfileCompleted();
		expect(getProfileCompleted()).toBe(false);
	});

	it("persists the flag across separate reads", () => {
		markProfileCompleted();
		expect(getProfileCompleted()).toBe(true);
		expect(getProfileCompleted()).toBe(true);
	});

	it("ignores arbitrary localStorage values at the key", () => {
		localStorage.setItem("clc_profileCompleted", "yes");
		// only "true" is truthy per the implementation
		expect(getProfileCompleted()).toBe(false);
	});
});
