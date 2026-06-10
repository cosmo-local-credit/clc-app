export function resolveRelyingPartyId(envValue: string | undefined, hostname?: string): string {
  const trimmedEnvValue = envValue?.trim();
  if (trimmedEnvValue) {
    try {
      return new URL(trimmedEnvValue).hostname;
    } catch {
      return trimmedEnvValue;
    }
  }

  const resolvedHostname =
    hostname ?? (typeof window !== "undefined" ? window.location?.hostname : undefined);
  const trimmedHostname = resolvedHostname?.trim();
  if (trimmedHostname) return trimmedHostname;

  return "localhost";
}
