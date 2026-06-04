const DEFAULT_APP_ORIGIN = "http://localhost";

export function normalizeNotificationTargetUrl(
	targetUrl: unknown,
	appOrigin = readCurrentOrigin(),
): string | null {
	if (typeof targetUrl !== "string") {
		return null;
	}

	const trimmedTargetUrl = targetUrl.trim();
	if (
		trimmedTargetUrl === "" ||
		hasControlCharacter(trimmedTargetUrl) ||
		trimmedTargetUrl.includes("\\")
	) {
		return null;
	}

	const normalizedOrigin = normalizeOrigin(appOrigin);
	if (!normalizedOrigin) {
		return null;
	}

	try {
		const parsed = new URL(trimmedTargetUrl, `${normalizedOrigin}/`);

		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		if (parsed.origin !== normalizedOrigin) {
			return null;
		}
		if (parsed.username !== "" || parsed.password !== "") {
			return null;
		}

		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return null;
	}
}

export function isSafeNotificationTargetUrl(
	targetUrl: unknown,
	appOrigin = readCurrentOrigin(),
): boolean {
	return normalizeNotificationTargetUrl(targetUrl, appOrigin) !== null;
}

function normalizeOrigin(appOrigin: string): string | null {
	try {
		return new URL(appOrigin).origin;
	} catch {
		return null;
	}
}

function readCurrentOrigin(): string {
	if (typeof location !== "undefined" && location.origin !== "null") {
		return location.origin;
	}

	return DEFAULT_APP_ORIGIN;
}

function hasControlCharacter(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 31 || code === 127) {
			return true;
		}
	}

	return false;
}
