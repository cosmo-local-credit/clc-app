import { isHttpUrl } from "@clc/core/lib/contact";
import type { AssetOwnerInfo } from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { InfoRow } from "#/components/ui/info-row";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { EllipsizedAddress } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";

/**
 * What a voucher is worth, what it is for, and how to reach its issuer.
 *
 * Shared by the voucher page's Info tab and the market card's Overview. Neither
 * the location map nor the owner's contract actions belong here: the page adds
 * both around it, and the card sits over a map already.
 */
export function VoucherAbout({
  rate,
  symbol,
  description,
  contractAddress,
  email,
  website,
  phone,
  terms,
  issuerAddress,
  ownerInfo,
}: {
  rate: { value: string; unit: string } | null;
  symbol: string;
  description: string | null;
  contractAddress: string | undefined;
  email: string | null;
  website: string | null;
  phone: string | null;
  /** Either a link to the issuer's terms or the terms themselves, as Markdown. */
  terms: string | null;
  issuerAddress: string | null;
  ownerInfo?: AssetOwnerInfo;
}) {
  const { t } = useLingui();

  return (
    <>
      {rate || description ? (
        <div className="space-y-3 border border-border bg-card p-4">
          {rate ? (
            <p className="font-mono text-sm font-semibold leading-tight text-primary">
              <Trans>
                1 {symbol} = {rate.value} {rate.unit}
              </Trans>
            </p>
          ) : null}
          {description ? (
            <p dir="auto" className="text-sm leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="border border-border bg-card">
        <InfoRow label={t`Contract address`}>
          {contractAddress ? (
            <button
              type="button"
              aria-label={t`Copy contract address`}
              className="flex min-w-0 items-center gap-1.5"
              onClick={() => {
                if (!navigator.clipboard) {
                  toast.error(t`Couldn't copy contract address`);
                  return;
                }
                void navigator.clipboard
                  .writeText(contractAddress)
                  .then(() => toast.success(t`Contract address copied`))
                  .catch(() => toast.error(t`Couldn't copy contract address`));
              }}
            >
              <EllipsizedAddress address={contractAddress} />
              <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                <RiFileCopyLine className="size-3" aria-hidden="true" />
              </span>
            </button>
          ) : (
            "—"
          )}
        </InfoRow>
        {email ? (
          <InfoRow label={t`Email`}>
            <a
              href={`mailto:${email}`}
              className="max-w-full truncate underline underline-offset-2"
            >
              {email}
            </a>
          </InfoRow>
        ) : null}
        <InfoRow label={t`Website`}>
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-full truncate underline underline-offset-2"
            >
              {website}
            </a>
          ) : (
            "—"
          )}
        </InfoRow>
        {phone ? (
          <InfoRow label={t`Phone`}>
            <a href={`tel:${phone}`} className="max-w-full truncate underline underline-offset-2">
              {phone}
            </a>
          </InfoRow>
        ) : null}
        {terms && isHttpUrl(terms) ? (
          <InfoRow label={t`Terms`}>
            <a
              href={terms}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-full truncate underline underline-offset-2"
            >
              {terms}
            </a>
          </InfoRow>
        ) : null}
        <InfoRow label={t`Issuer`}>
          {issuerAddress ? (
            <div className="min-w-0 space-y-1">
              <RecipientIdentityLabel address={issuerAddress} />
              <MultisigOwnerNotice info={ownerInfo} />
            </div>
          ) : (
            "—"
          )}
        </InfoRow>
      </dl>

      {terms && !isHttpUrl(terms) ? (
        <div className="border border-border bg-card p-4">
          <p className="text-sm font-semibold leading-snug">
            <Trans>Terms</Trans>
          </p>
          <MarkdownContent className="mt-2">{terms}</MarkdownContent>
        </div>
      ) : null}
    </>
  );
}
