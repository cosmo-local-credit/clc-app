import { safeAppQueueUrl, type AssetOwnerInfo } from "@clc/core/features/safe/logic";
import { Trans } from "@lingui/react/macro";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";

/** Public ownership, shared by voucher and pool details; never signer-only. */
export function MultisigOwnerNotice({ info }: { info: AssetOwnerInfo | undefined }) {
  if (info?.kind !== "safe") return null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        {info.threshold === null ? (
          <Trans>Multisig owned · {info.signers.length} signers</Trans>
        ) : (
          <Trans>
            Multisig owned · {info.threshold} of {info.signers.length} signers
          </Trans>
        )}
      </p>
      {SAFE_APP_PREFIX ? (
        <a
          href={safeAppQueueUrl(SAFE_APP_PREFIX, info.owner)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          <Trans>Open in Safe</Trans>
        </a>
      ) : null}
    </div>
  );
}
