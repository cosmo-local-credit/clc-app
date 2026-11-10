import { createContext, type ReactNode, useContext } from "react";

/**
 * The views `AuthenticatedRoute` shows a guest, supplied from above it. The
 * phone's own screens are the default; the root route fills this slot on a
 * desktop layout, so this shared component never imports the desktop layer.
 */
export type AuthGateSlot = {
  /** A guest reached a protected route. `redirectTo` is where sign-in returns. */
  required: (props: { redirectTo?: string }) => ReactNode;
  /** The session check failed; the one action is to try it again. */
  sessionError: (props: { onRetry: () => void; retrying: boolean }) => ReactNode;
};

const AuthGateSlotContext = createContext<AuthGateSlot | null>(null);

export const AuthGateSlotProvider = AuthGateSlotContext.Provider;

export function useAuthGateSlot(): AuthGateSlot | null {
  return useContext(AuthGateSlotContext);
}
