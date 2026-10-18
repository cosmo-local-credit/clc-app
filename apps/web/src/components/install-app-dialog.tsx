import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
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
    <SettingsSheet
      open={open}
      onOpenChange={onOpenChange}
      title={<Trans>Install CLC</Trans>}
      footer={
        <>
          {promptEvent || status === "prompting" ? (
            <Button
              tap
              className="w-full"
              pending={status === "prompting"}
              onClick={() => void requestInstall()}
            >
              {status === "prompting" ? (
                <Trans>Waiting for confirmation…</Trans>
              ) : (
                <Trans>Install now</Trans>
              )}
            </Button>
          ) : null}
          <Button variant="outline" tap className="w-full" onClick={() => onOpenChange(false)}>
            <Trans>Continue in browser</Trans>
          </Button>
        </>
      }
    >
      {promptEvent || status === "prompting" ? null : <InstallInstructions />}
      {status === "error" ? (
        <SettingsSheetAlert>
          <Trans>Couldn't open installation. Follow these instructions or try again later.</Trans>
        </SettingsSheetAlert>
      ) : null}
    </SettingsSheet>
  );
}
