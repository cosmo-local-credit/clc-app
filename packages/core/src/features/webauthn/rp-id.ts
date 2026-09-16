export function resolveRelyingPartyId(envValue: string | undefined, hostname?: string): string {
  const resolvedHostname =
    hostname ?? (typeof window !== "undefined" ? window.location?.hostname : undefined);
  const trimmedHostname = resolvedHostname?.trim();

  const trimmedEnvValue = envValue?.trim();
  const envHostname = trimmedEnvValue ? normalizeHostname(trimmedEnvValue) : undefined;

  if (envHostname && (!trimmedHostname || isDomainSuffixOrEqual(envHostname, trimmedHostname))) {
    return envHostname;
  }

  if (trimmedHostname) return trimmedHostname;
  if (envHostname) return envHostname;

  return "localhost";
}

function normalizeHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function isDomainSuffixOrEqual(candidateSuffix: string, hostname: string): boolean {
  return hostname === candidateSuffix || hostname.endsWith(`.${candidateSuffix}`);
}
