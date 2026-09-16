import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RiDownloadLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { createInstallDialog, preloadInstallDialog } from "#/features/install/install-dialog";
import { updateInstallState, useInstallStore } from "#/features/install/install-store";

export function InstallAppButton({ showHelpLink = false }: { showHelpLink?: boolean }) {
  const status = useInstallStore((state) => state.status);
  const installed = useInstallStore((state) => state.installed);
  const [loading, setLoading] = useState(false);
  const controller = useRef<ReturnType<typeof createInstallDialog> | null>(null);
  useEffect(() => {
    if (installed) return;
    const dialog = createInstallDialog();
    controller.current = dialog;
    // Preload when the CTA appears, but never open without a tap. Retry failed
    // imports on tap; the translated help remains usable if loading fails.
    void preloadInstallDialog().catch(() => {});
    return () => {
      controller.current = null;
      dialog.dispose();
    };
  }, [installed]);

  async function open() {
    const dialog = controller.current;
    if (!dialog) return;
    setLoading(true);
    try {
      await dialog.open();
    } catch {
      if (controller.current === dialog) updateInstallState({ status: "error" });
    } finally {
      if (controller.current === dialog) setLoading(false);
    }
  }

  if (installed) return null;
  return (
    <div className="space-y-3">
      <Button
        className="h-11 w-full"
        variant="outline"
        disabled={loading || status === "prompting"}
        onClick={() => void open()}
      >
        <RiDownloadLine aria-hidden="true" />
        {loading || status === "prompting" ? (
          <Trans>Waiting for confirmation…</Trans>
        ) : (
          <Trans>Install CLC</Trans>
        )}
      </Button>
      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          <Trans>Couldn't open installation. Follow the steps below or try again later.</Trans>
        </p>
      ) : null}
      {showHelpLink ? (
        <Link to="/install" className="block text-center text-muted-foreground text-sm underline">
          <Trans>Add CLC to your phone</Trans>
        </Link>
      ) : null}
    </div>
  );
}
