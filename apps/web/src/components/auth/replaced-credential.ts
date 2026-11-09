import { BackendApiError } from "@clc/api/client/errors";
import { useLingui } from "@lingui/react/macro";

/**
 * What to tell someone signing in with a credential that a key rotation left
 * behind, or null for any other error. clc-core's own text is English and
 * names no way forward; both cases here have one.
 */
export function useReplacedCredentialMessage() {
  const { t } = useLingui();
  return (error: unknown): string | null => {
    if (!(error instanceof BackendApiError)) return null;
    if (error.kind === "card-replaced") {
      return t`This sign-in card was replaced. Sign in with your new card.`;
    }
    if (error.kind === "passkey-moved") {
      return t`This passkey moved with your account. Sign in with your new card to finish moving it.`;
    }
    return null;
  };
}
