import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { cn } from "#/lib/utils";
import { EllipsizedAddress, HighlightAddress } from "./wallet-address";

/** Always looks up the current label by address, so renames cannot redirect a contact. */
export function RecipientIdentityLabel({
  address,
  fallback,
  className,
  showAddress = false,
}: {
  address: string;
  fallback?: string;
  className?: string;
  showAddress?: boolean;
}) {
  const identity = useReverseRecipientResolution(address);
  const fallbackLabel = fallback && !fallback.toLowerCase().startsWith("0x") ? fallback : null;

  if (showAddress) {
    return (
      <span className={cn("flex min-w-0 flex-col items-end gap-1 text-end", className)}>
        {identity.data ? (
          <RecipientIdentityText
            identity={identity.data}
            className="block break-words text-xs font-semibold"
          />
        ) : fallbackLabel ? (
          <span dir="auto" className="block break-words text-xs font-semibold">
            {fallbackLabel}
          </span>
        ) : null}
        <HighlightAddress address={address} className="text-end" />
      </span>
    );
  }
  if (identity.data) {
    return <RecipientIdentityText identity={identity.data} className={className} />;
  }
  if (fallbackLabel) {
    return (
      <span dir="auto" className={className}>
        {fallbackLabel}
      </span>
    );
  }
  return <EllipsizedAddress address={address} className={className} />;
}

export function RecipientIdentityText({
  identity,
  className,
}: {
  identity: RecipientIdentity;
  className?: string;
}) {
  if (identity.kind === "user") {
    return (
      <span dir="ltr" className={className}>
        {identity.alias}
      </span>
    );
  }
  if (identity.name === identity.alias) {
    return (
      <span dir="auto" className={className}>
        {identity.name}
      </span>
    );
  }

  return (
    <span className={className}>
      <span dir="auto">{identity.name}</span> (<bdi dir="auto">{identity.alias}</bdi>)
    </span>
  );
}
