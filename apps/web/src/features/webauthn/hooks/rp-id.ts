export function resolveRelyingPartyId(
	envValue: string | undefined,
	hostname?: string,
): string {
	const trimmedEnvValue = envValue?.trim();
	if (trimmedEnvValue) return trimmedEnvValue;

	const resolvedHostname =
		hostname ??
		(typeof window !== "undefined" ? window.location?.hostname : undefined);
	const trimmedHostname = resolvedHostname?.trim();
	if (trimmedHostname) return trimmedHostname;

	return "localhost";
}