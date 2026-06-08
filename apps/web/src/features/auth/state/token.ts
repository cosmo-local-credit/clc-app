// In-memory JWT store. The token is per-session and re-acquired after page
// reload by repeating the SIWE flow. We deliberately avoid localStorage to
// prevent XSS token theft; the cookie-based fallback already covers persistence.

const TOKEN_KEY = "clc_auth_token";

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}
