import { poolDeploymentContractCount } from "@clc/core/features/pools/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Button } from "#/components/ui/button";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { DeskPanel, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { cn } from "#/lib/utils";
import {
  CreatePoolFormFoot,
  type CreatePoolController,
  FIELDS_CLEAR_OF_FOOT,
  PoolSummaryDesk,
} from "./create-pool-parts";

/** Step 3: everything that will be published, the terms to accept, and Publish. */
export function ReviewStepDesk({ pool }: { pool: CreatePoolController }) {
  const { form, validators } = pool;

  return (
    <form
      className={cn("grid min-w-0 content-start gap-[18px]", FIELDS_CLEAR_OF_FOOT)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <DeskTitle>
        <Trans>Confirm and publish</Trans>
      </DeskTitle>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <>
            <PoolSummaryDesk values={values} full />
            {values.terms !== "" && !isHttpUrl(values.terms) ? (
              <DeskSection title={<Trans>Terms</Trans>}>
                <DeskPanel>
                  <MarkdownContent>{values.terms}</MarkdownContent>
                </DeskPanel>
              </DeskSection>
            ) : null}
          </>
        )}
      </form.Subscribe>

      <form.Field name="acceptedTerms" validators={validators.acceptedTerms}>
        {(field) => (
          <TermsAcceptanceField
            id="pool-terms"
            checked={field.state.value}
            onCheckedChange={field.handleChange}
            error={getFieldError(field.state.meta.errors)}
          />
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) =>
          [state.isSubmitting, state.values.pricing, state.values.acceptedTerms] as const
        }
      >
        {([isSubmitting, pricing, acceptedTerms]) => {
          const publishing = isSubmitting || pool.deployPool.isPending;
          return (
            <CreatePoolFormFoot>
              <span className="me-auto text-muted-foreground text-xs">
                <Trans>Publishes {poolDeploymentContractCount(pricing)} contracts</Trans>
              </span>
              <Button asChild variant="outline">
                <Link to="/pools/create/$step" params={{ step: "place" }}>
                  <Trans>Back</Trans>
                </Link>
              </Button>
              <Button
                type="submit"
                disabled={!acceptedTerms || !pool.canPublish}
                pending={publishing}
              >
                {publishing ? <Trans>Publishing…</Trans> : <Trans>Confirm and publish</Trans>}
              </Button>
            </CreatePoolFormFoot>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
