import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { SendRecipientPage } from "#/features/wallet/ui";

const SendDesk = lazy(() =>
  import("#/desktop/wallet/send-desk").then((module) => ({ default: module.SendDesk })),
);

const searchSchema = z.object({
  /** Contract address of the token to preselect on the amount step. */
  token: z.string().optional().catch(undefined),
  /** Amount to seed the amount step with, carried through the recipient step. */
  amount: z.string().optional().catch(undefined),
  /** Address the desktop palette pre-fills. The phone flow ignores it. */
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/wallet/send/")({
  staticData: { desktop: "fill" },
  validateSearch: searchSchema,
  component: SendRecipientRoute,
});

function SendRecipientRoute() {
  const { token, amount, to } = Route.useSearch();
  const seeded = to && isAddress(to) ? getAddress(to) : undefined;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<SendRecipientPage token={token} amount={amount} />}
        desktop={<SendDesk step="recipient" token={token} amount={amount} to={seeded} />}
      />
    </AuthenticatedRoute>
  );
}
