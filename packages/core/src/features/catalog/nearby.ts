/** Only account scopes may use the backend nearby mode (saved profile location).
 * Guest scopes still isolate cached results, but use public requests and local filtering.
 */
export function isAccountNearbyScope(scope: string | undefined): boolean {
  return scope?.startsWith("nearby:") ?? false;
}
