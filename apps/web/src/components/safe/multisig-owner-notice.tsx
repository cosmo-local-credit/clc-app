import { safeAppQueueUrl, type AssetOwnerInfo } from "@clc/core/features/safe/logic";
import { Trans } from "@lingui/react/macro";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";

/**
 * Public ownership, shared by voucher and pool details; never signer-only.
 * Spans, not a paragraph: the base `p` rule sets body size, which would
 * override the caption size inherited here.
 */
export function MultisigOwnerNotice({ info }: { info: AssetOwnerInfo | undefined }) {
  if (info?.kind !== "safe") return null;
  return (
    <span className="flex flex-col gap-0.5 text-xs leading-snug text-muted-foreground">
      <span>
        {info.threshold === null ? (
          <Trans>Multisig owned · {info.signers.length} signers</Trans>
        ) : (
          <Trans>
            Multisig owned · {info.threshold} of {info.signers.length} signers
          </Trans>
        )}
      </span>
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
    </span>
  );
}
