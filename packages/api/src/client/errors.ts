/**
 * Backend failure type, shared by every resource module and both apps.
 *
 * Owned by `client/` rather than by any one feature: an error raised while
 * fetching pools is not an auth concern, and the transport layer must be able to
 * throw it without importing from `features/`.
 */

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly code?: string,
  ) {
    super(description);
    this.name = "BackendApiError";
  }
}

export function formatBackendApiError(err: BackendApiError): string {
  return err.code ? `${err.code}: ${err.description}` : err.description;
}
