import { recipientLabel } from "@clc/api/features/recipients/client";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { EllipsizedAddress } from "./wallet-address";

/** Always looks up the current label by address, so renames cannot redirect a contact. */
export function RecipientIdentityLabel({
  address,
  fallback,
  className,
}: {
  address: string;
  fallback?: string;
  className?: string;
}) {
  const identity = useReverseRecipientResolution(address);
  if (identity.data) return <span className={className}>{recipientLabel(identity.data)}</span>;
  if (fallback && !fallback.startsWith("0x")) return <span className={className}>{fallback}</span>;
  return <EllipsizedAddress address={address} className={className} />;
}
