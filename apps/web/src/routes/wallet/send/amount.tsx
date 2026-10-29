import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { SendAmountPage } from "#/features/wallet/ui";

const SendDesk = lazy(() =>
  import("#/desktop/wallet/send-desk").then((module) => ({ default: module.SendDesk })),
);

const searchSchema = z.object({
  /** Contract address of the token to preselect. */
  token: z.string().optional().catch(undefined),
  /** Resolved recipient address from the send-to step. */
  recipient: z.string().optional().catch(undefined),
  /** Human-readable recipient label from lookup or address book. */
  recipientLabel: z.string().optional().catch(undefined),
  /** Amount to seed the field with, carried in from a shortcut such as post-swap send. */
  amount: z.string().optional().catch(undefined),
  /**
   * Pool to return to once the send completes, set by that pool's Deposit
   * shortcut. An address rather than a path so nothing can steer the receipt's
   * exit at an arbitrary route.
   */
  returnPool: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/send/amount")({
  staticData: { desktop: "fill" },
  validateSearch: searchSchema,
  component: SendAmountRoute,
});

function SendAmountRoute() {
  const { token, recipient, recipientLabel, amount, returnPool } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <SendAmountPage
            token={token}
            recipient={recipient}
            recipientLabel={recipientLabel}
            amount={amount}
            returnPool={returnPool}
          />
        }
        desktop={<SendDesk step="amount" token={token} amount={amount} />}
      />
    </AuthenticatedRoute>
  );
}
