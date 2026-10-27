import { useOperatorKeyStore } from "#/features/auth/operator-key";

/** The address the loaded operator key will sign as. */
export function useOperatorAddress(): `0x${string}` | null {
  return useOperatorKeyStore((state) => {
    if (!state.key) return null;
    return state.key.kind === "privateKey" ? state.key.address : state.key.credential.address;
  });
}

export function sameAddress(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}
