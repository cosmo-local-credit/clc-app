import type { NfcCardContent, NfcErrorKind, NfcSessionPhase } from "@clc/core/features/nfc/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { FiLoader } from "react-icons/fi";
import { TbNfc } from "react-icons/tb";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/** What a tap produced that is not a usable card, for the prompt to explain. */
export type NfcCardProblem = Exclude<NfcCardContent["kind"], "credential">;

export function useNfcMessages() {
  const { t } = useLingui();
  return {
    unreadable: t`Couldn't read that card. Hold it still against the back of your phone and try again.`,
    error: (kind: NfcErrorKind): string => {
      switch (kind) {
        case "unsupported":
          return t`This phone or browser can't read NFC cards. Use the QR code instead.`;
        case "permission-denied":
          return t`NFC access was blocked. Allow NFC for this site in your browser settings, then try again.`;
        case "disabled":
          return t`NFC is turned off. Turn it on in your phone's settings, then try again.`;
        case "busy":
          return t`Another card scan is already running. Try again.`;
        default:
          return t`The card reader couldn't start. Try again.`;
      }
    },
    problem: (problem: NfcCardProblem): string => {
      switch (problem) {
        case "blank":
          return t`This card is blank.`;
        case "ambiguous":
          return t`This card holds more than one wallet. Use another card.`;
        case "invalid-credential":
          return t`This card's wallet key is damaged and can't be used.`;
        default:
          return t`This card doesn't hold a CLC wallet.`;
      }
    },
  };
}

/**
 * The visible half of a scan session: hold-the-card guidance while listening,
 * and the reason when it is not. The session itself belongs to the workflow.
 */
export function NfcCardPrompt({
  phase,
  error,
  readFailed,
  problem,
  title,
  detail,
  onRetry,
  onCancel,
}: {
  phase: NfcSessionPhase;
  error: NfcErrorKind | null;
  readFailed: boolean;
  problem?: NfcCardProblem | null;
  title: ReactNode;
  detail?: ReactNode;
  onRetry: () => void;
  onCancel?: () => void;
}) {
  const messages = useNfcMessages();
  const listening = phase === "ready" || phase === "handling";
  const failed = phase === "error" && error !== null;
  const stopped = phase === "cancelled";
  const notice = failed
    ? messages.error(error)
    : readFailed
      ? messages.unreadable
      : problem
        ? messages.problem(problem)
        : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 border border-border bg-card p-4 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary",
            listening && "animate-pulse",
          )}
          aria-hidden="true"
        >
          {phase === "starting" ? (
            <FiLoader className="size-6 animate-spin" />
          ) : (
            <TbNfc className="size-7" />
          )}
        </span>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {phase === "starting" ? (
            <Trans>Starting the card reader…</Trans>
          ) : listening ? (
            (detail ?? <Trans>Hold the card flat against the back of your phone.</Trans>)
          ) : stopped ? (
            <Trans>The card reader stopped.</Trans>
          ) : null}
        </p>
        {notice ? (
          <p role="alert" className="text-destructive text-xs">
            {notice}
          </p>
        ) : null}
      </div>
      {failed || stopped ? (
        <Button size="lg" className="w-full" onClick={onRetry}>
          <TbNfc className="me-2 size-4" />
          <Trans>Try again</Trans>
        </Button>
      ) : null}
      {onCancel ? (
        <Button variant="ghost" size="lg" className="w-full" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      ) : null}
    </div>
  );
}
