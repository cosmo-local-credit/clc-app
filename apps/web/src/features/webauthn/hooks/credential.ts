const RETRY_DELAY_MS = 250;

// Android's Credential Manager commonly fails the FIRST call after a cold start
// with NotReadableError ("An unknown error occurred while talking to the
// credential manager") and then succeeds on an immediate retry. AbortError and
// the generic UnknownError are similarly transient. NotAllowedError is the user
// cancelling / timing out and must NOT be retried.
function isTransientCredentialError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotReadableError" || err.name === "UnknownError" || err.name === "AbortError")
  );
}

async function withTransientRetry<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isTransientCredentialError(err)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        return await op();
      } catch (retryErr) {
        logCredentialError(`${label} (after retry)`, retryErr);
        throw retryErr;
      }
    }
    // User cancellation/timeout is expected; everything else is a genuine
    // failure that React Query would otherwise swallow into mutation state, so
    // surface it (with the DOMException name — the real diagnostic).
    if (!(err instanceof DOMException && err.name === "NotAllowedError")) {
      logCredentialError(label, err);
    }
    throw err;
  }
}

function logCredentialError(label: string, err: unknown): void {
  const detail = err instanceof DOMException ? `${err.name}: ${err.message}` : err;
  console.error(`[webauthn] ${label}`, detail, err);
}

// Wraps navigator.credentials.get with the cold-start retry. Throws if the
// authenticator returns no assertion.
export async function requestWebAuthnAssertion(
  options: CredentialRequestOptions,
): Promise<PublicKeyCredential> {
  const assertion = await withTransientRetry("credentials.get", () =>
    navigator.credentials.get(options),
  );
  if (!assertion) throw new Error("WebAuthn assertion cancelled");
  return assertion as PublicKeyCredential;
}

// Wraps navigator.credentials.create with the cold-start retry. Throws if the
// authenticator returns no credential.
export async function createWebAuthnPasskey(
  options: CredentialCreationOptions,
): Promise<PublicKeyCredential> {
  const credential = await withTransientRetry("credentials.create", () =>
    navigator.credentials.create(options),
  );
  if (!credential) throw new Error("WebAuthn credential creation cancelled");
  return credential as PublicKeyCredential;
}
