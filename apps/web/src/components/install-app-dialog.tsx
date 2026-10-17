import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { LanguageSelector } from "#/components/language-selector";
import { InstallInstructions } from "#/components/install-instructions";
import { requestInstall, useInstallStore } from "#/features/install/install-store";

export function InstallAppDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { promptEvent, status } = useInstallStore();
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="max-h-[calc(100svh-3rem)] space-y-5 overflow-y-auto">
          <LanguageSelector />
          <DialogTitle className="font-heading text-xl font-bold">
            <Trans>Install CLC</Trans>
          </DialogTitle>
          {promptEvent || status === "prompting" ? (
            <Button
              size="lg"
              className="w-full"
              disabled={status === "prompting"}
              onClick={() => void requestInstall()}
            >
              {status === "prompting" ? (
                <Trans>Waiting for confirmation…</Trans>
              ) : (
                <Trans>Install now</Trans>
              )}
            </Button>
          ) : (
            <InstallInstructions />
          )}
          {status === "error" ? (
            <p role="alert" className="text-destructive text-sm">
              <Trans>
                Couldn't open installation. Follow these instructions or try again later.
              </Trans>
            </p>
          ) : null}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            <Trans>Continue in browser</Trans>
          </Button>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
