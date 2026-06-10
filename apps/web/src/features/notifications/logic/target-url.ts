export function normalizeNotificationTargetUrl(
  targetUrl: unknown,
  appOrigin: string | null | undefined = readCurrentOrigin(),
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

function normalizeOrigin(appOrigin: string | null | undefined): string | null {
  if (!appOrigin) {
    return null;
  }

  try {
    return new URL(appOrigin).origin;
  } catch {
    return null;
  }
}

function readCurrentOrigin(): string | null {
  if (typeof location !== "undefined" && location.origin !== "null") {
    return location.origin;
  }

  return null;
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
