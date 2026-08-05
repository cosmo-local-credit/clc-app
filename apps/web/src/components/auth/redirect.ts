/**
 * Accept only same-origin relative paths suitable as post-auth destinations.
 * Rejects onboarding itself so a sign-in screen cannot store a self-loop as
 * `redirect` (e.g. `/onboarding?step=signin`).
 */
export function sanitizeInternalRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return undefined;
    if (url.pathname === "/onboarding") return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}
