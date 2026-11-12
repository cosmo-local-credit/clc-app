import { BackendApiError } from "@clc/api/client/errors";
import {
  type AccountLifecycle,
  FULL_CAPABILITIES,
  isRecoveryLifecycle,
  type SessionCapabilities,
} from "@clc/core/features/account-retirement/logic";

import type { AuthStatus } from "#/features/auth/hooks/use-auth-status";

/** The one screen a retiring account lives in. */
const RECOVERY_PATH = "/recovery";

/** What a session may do when the backend says it is limited but not how. */
const NO_CAPABILITIES: SessionCapabilities = {
  canUseApp: false,
  canRecoverAssets: false,
  canTransferResources: false,
  canRestoreAccount: false,
};

/** The send and receive screens: moving funds is recovery, and the relayer does not gate it. */
const WALLET_RECOVERY_PATHS = ["/wallet/send", "/wallet/receive"] as const;

export type AccountLifecycleView =
  /** No session names this wallet yet, so nothing is known about its lifecycle. */
  | { known: false }
  | {
      known: true;
      lifecycle: AccountLifecycle;
      closesAt: string | null;
      capabilities: SessionCapabilities;
    };

type LifecycleInput = Pick<AuthStatus, "state" | "address" | "session">;

/**
 * The lifecycle of the signed-in wallet, read from the session query.
 *
 * Known only from a session that names the connected wallet. A failed re-check
 * still counts when it kept the last answer for this wallet, the same rule the
 * navigation uses for its private tabs; with no answer at all nothing is
 * assumed, so a restricted account is never treated as active on a guess.
 * A backend that omits the lifecycle predates retirement, which reads as ACTIVE.
 */
export function resolveAccountLifecycle({
  state,
  address,
  session,
}: LifecycleInput): AccountLifecycleView {
  if (state !== "authenticated" && state !== "sessionCheckError") return { known: false };
  if (!session || !address || session.address.toLowerCase() !== address.toLowerCase()) {
    return { known: false };
  }
  const lifecycle = session.accountLifecycle ?? "ACTIVE";
  return {
    known: true,
    lifecycle,
    closesAt: session.closesAt ?? null,
    capabilities:
      session.capabilities ?? (lifecycle === "ACTIVE" ? FULL_CAPABILITIES : NO_CAPABILITIES),
  };
}

/** Whether the session is limited to recovery. Unknown is not restricted: see `resolveAccountLifecycle`. */
export function isRecoverySession(auth: LifecycleInput): boolean {
  const view = resolveAccountLifecycle(auth);
  return view.known && isRecoveryLifecycle(view.lifecycle);
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Whether a retiring account may open this route. Everything else sends it to the shell. */
export function isRecoveryPath(pathname: string, capabilities: SessionCapabilities): boolean {
  const path = normalizePath(pathname);
  if (path === RECOVERY_PATH) return true;
  return capabilities.canRecoverAssets && WALLET_RECOVERY_PATHS.some((base) => isUnder(path, base));
}

/**
 * Where the current route must hand over to, or null to stay.
 *
 * A retiring account is sent to the shell from every route outside the
 * recovery set, and an active one is sent out of it. A guest has no account to
 * recover. A wallet whose session is still loading, expired or failed is left
 * to the route's own sign-in and retry screens, which show nothing restricted.
 */
export function lifecycleRedirect(
  pathname: string,
  auth: LifecycleInput,
): "/" | "/recovery" | null {
  const path = normalizePath(pathname);
  const view = resolveAccountLifecycle(auth);
  if (view.known) {
    if (isRecoveryLifecycle(view.lifecycle)) {
      return isRecoveryPath(path, view.capabilities) ? null : RECOVERY_PATH;
    }
    return path === RECOVERY_PATH ? "/" : null;
  }
  return path === RECOVERY_PATH && auth.state === "guest" ? "/" : null;
}

/** The refusal a retiring account's session gets for any write outside recovery. */
export function isAccountRetiredError(error: unknown): boolean {
  return error instanceof BackendApiError && error.status === 403 && error.code === "E23";
}
