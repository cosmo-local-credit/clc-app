type WebAuthnOperation = "create" | "get";

function getWebAuthnSupportError(operation: WebAuthnOperation): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Passkeys are only available in a browser.";
  }

  if (!window.isSecureContext) {
    return "Passkeys require a secure context. Open this app on https:// or localhost.";
  }

  if (typeof PublicKeyCredential === "undefined") {
    return "This browser does not support passkeys.";
  }

  if (!navigator.credentials) {
    return "This browser does not expose the Credentials API needed for passkeys.";
  }

  if (typeof navigator.credentials[operation] !== "function") {
    return operation === "create"
      ? "This browser can't create a passkey on this page."
      : "This browser can't use a passkey on this page.";
  }

  return null;
}

export function assertWebAuthnSupported(operation: WebAuthnOperation): void {
  const error = getWebAuthnSupportError(operation);
  if (error) {
    throw new Error(error);
  }
}
