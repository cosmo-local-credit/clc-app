import { resolveMarkerStyle } from "@clc/core/features/markers/logic";
import { voucherTermsSchema } from "@clc/core/features/vouchers/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Button } from "#/components/ui/button";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { MarkerPin } from "#/components/vouchers/marker-style-picker";
import { useMarkerLabels } from "#/components/vouchers/voucher-labels";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskTitle } from "#/desktop/ui/page";
import { FormFoot, type VoucherWizard } from "./wizard-bits";

/** Prose in a mono KV cell: sans, and allowed to wrap. */
function Prose({ children }: { children: ReactNode }) {
  return (
    <span dir="auto" className="block font-sans font-normal whitespace-normal break-words">
      {children}
    </span>
  );
}

/** Step 3, Confirm and publish: the summary, the terms, the agreement. */
export function ReviewStep({ wizard }: { wizard: VoucherWizard }) {
  const { t } = useLingui();
  const markerLabels = useMarkerLabels();
  const { form } = wizard;
  return (
    <>
      <DeskTitle>
        <Trans>Confirm and publish</Trans>
      </DeskTitle>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const pin = resolveMarkerStyle({
            kind: "voucher",
            markerIcon: values.markerIcon,
            markerColor: values.markerColor,
          });
          return (
            <>
              <DeskKV
                labelWidth="140px"
                rows={[
                  [t`Name`, <Prose key="name">{values.name}</Prose>],
                  [t`Symbol`, values.symbol],
                  [t`Price`, `${values.price} ${values.unitOfAccount}`],
                  [t`Supply`, `${values.supply} ${values.symbol}`],
                  [t`Type`, <Prose key="type">{t`Standard`}</Prose>],
                  [t`Decimals`, values.decimals],
                  [t`Description`, <Prose key="description">{values.description}</Prose>],
                  [
                    t`Location`,
                    <Prose key="location">{values.location?.locationName ?? "—"}</Prose>,
                  ],
                  [
                    t`Map pin`,
                    <span key="pin" className="flex items-center gap-2 font-sans font-normal">
                      <MarkerPin style={pin} size={20} />
                      {values.markerIcon === null ? t`Default` : markerLabels.icon(pin.icon)}
                    </span>,
                  ],
                  [t`Tags`, <Prose key="tags">{values.tags.join(", ") || "—"}</Prose>],
                  [t`Email`, values.email || "—"],
                  [t`Website`, values.website || "—"],
                  [t`Phone`, values.phone || "—"],
                  [
                    t`Terms`,
                    values.terms === "" ? (
                      "—"
                    ) : isHttpUrl(values.terms) ? (
                      values.terms
                    ) : (
                      <Prose key="terms">{t`Written below`}</Prose>
                    ),
                  ],
                ]}
              />
              {values.terms !== "" && !isHttpUrl(values.terms) ? (
                <div className="grid gap-2 border border-border bg-card p-4">
                  <p className="text-sm font-semibold">
                    <Trans>Terms</Trans>
                  </p>
                  <MarkdownContent>{values.terms}</MarkdownContent>
                </div>
              ) : null}
            </>
          );
        }}
      </form.Subscribe>

      <form.Field name="acceptedTerms" validators={{ onSubmit: voucherTermsSchema }}>
        {(field) => (
          <TermsAcceptanceField
            id="voucher-terms"
            checked={field.state.value}
            onCheckedChange={field.handleChange}
            error={getFieldError(field.state.meta.errors)}
          />
        )}
      </form.Field>

      <FormFoot>
        <Button variant="outline" asChild>
          <Link to="/vouchers/create/$step" params={{ step: "place" }}>
            <Trans>Back</Trans>
          </Link>
        </Button>
        <form.Subscribe
          selector={(state) => [state.isSubmitting, state.values.acceptedTerms] as const}
        >
          {([isSubmitting, acceptedTerms]) => {
            const publishing = isSubmitting || wizard.deployVoucher.isPending;
            return (
              <Button
                type="submit"
                disabled={!acceptedTerms || wizard.blocked}
                pending={publishing}
              >
                {publishing ? <Trans>Publishing…</Trans> : <Trans>Confirm and publish</Trans>}
              </Button>
            );
          }}
        </form.Subscribe>
      </FormFoot>
    </>
  );
}
