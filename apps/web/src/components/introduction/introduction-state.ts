import Cookies from "js-cookie";

// Stable across releases and languages: content edits must not reset completion.
export const INTRODUCTION_STORAGE_KEY = "clc.introduction.v1";
const COOKIE_NAME = "clc_intro_seen";
let completedInMemory = false;

export function hasSeenIntroduction(): boolean {
  if (completedInMemory) return true;
  try {
    if (window.localStorage.getItem(INTRODUCTION_STORAGE_KEY) === "done") return true;
  } catch {
    // Check the independent cookie fallback when local storage is unavailable.
  }
  try {
    return Cookies.get(COOKIE_NAME) === "done";
  } catch {
    return false;
  }
}

export function completeIntroduction() {
  completedInMemory = true;
  try {
    window.localStorage.setItem(INTRODUCTION_STORAGE_KEY, "done");
  } catch {
    // Browsers with unavailable storage still remember for this page session.
  }
  try {
    Cookies.set(COOKIE_NAME, "done", {
      expires: 365,
      path: "/",
      sameSite: "lax",
      secure: window.location.protocol === "https:",
    });
  } catch {
    // This preference is not an authorization check. Storage failure must not block access.
  }
}

export function isIntroductionEntry(
  pathname: string,
  search: Record<string, unknown>,
  hash: string,
) {
  // Never interrupt wallet imports, transaction links, or explicit sign-in/setup.
  if (hash) return false;
  if (pathname === "/") {
    // The router adds default home search values even to a bare first visit.
    return Object.entries(search).every(
      ([key, value]) =>
        value === undefined ||
        (key === "tab" && value === "market") ||
        (key === "view" && value === "map"),
    );
  }
  return (
    pathname === "/onboarding" &&
    (!search.step || search.step === "welcome") &&
    Object.keys(search).every((key) => key === "step" || key === "redirect")
  );
}
