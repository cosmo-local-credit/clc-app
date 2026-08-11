/**
 * Backend configuration, resolved once at module load.
 *
 * A production build must not silently fall back to localhost. Doing so turns a
 * missing deployment variable into a confusing per-request network error at
 * runtime instead of an obvious failure, and in a browser it produces requests to
 * the operator's own machine. Development keeps the localhost default because
 * that is the normal local backend.
 */

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured?.trim()) return configured.trim().replace(/\/+$/, "");

  if (import.meta.env.PROD) {
    throw new Error(
      "VITE_API_URL is not set. A production build must be given the backend URL " +
        "explicitly; falling back to localhost would send every request to the user's " +
        "own machine.",
    );
  }

  return "http://localhost:5003";
}

export const API_URL: string = resolveApiUrl();

export const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

export const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
