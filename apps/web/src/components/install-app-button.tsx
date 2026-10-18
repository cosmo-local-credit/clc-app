import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { RiDownloadLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { preloadInstallDialog } from "#/features/install/install-dialog";
import { useInstallStore } from "#/features/install/install-store";

type InstallDialogComponent = typeof import("./install-app-dialog").InstallAppDialog;

/**
 * Install CLC: the browser's own prompt where it offers one, the steps
 * otherwise. `quiet` is the ghost button in Welcome's bottom row, which drops
 * the request notice because the browser is already showing its prompt.
 */
export function InstallAppButton({ quiet = false }: { quiet?: boolean }) {
  const { status, installed } = useInstallStore();
  const [DialogComponent, setDialogComponent] = useState<InstallDialogComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!installed) void preloadInstallDialog().catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [installed]);

  async function showDialog() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const { InstallAppDialog } = await preloadInstallDialog();
      if (!mounted.current || useInstallStore.getState().installed) return;
      setDialogComponent(() => InstallAppDialog);
      setOpen(true);
    } catch {
      if (mounted.current) setLoadFailed(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  if (installed) return null;
  if (status === "accepted")
    return quiet ? null : (
      <p role="status" className="text-muted-foreground text-sm">
        <Trans>Installation requested. Follow your browser's instructions to finish.</Trans>
      </p>
    );
  return (
    <div className={quiet ? "min-w-0" : "space-y-3"}>
      <Button
        className="w-full"
        variant={quiet ? "ghost" : "outline"}
        tap
        pending={loading || status === "prompting"}
        onClick={() => void showDialog()}
      >
        <RiDownloadLine aria-hidden="true" />
        {loading || status === "prompting" ? (
          <Trans>Waiting for confirmation…</Trans>
        ) : (
          <Trans>Install CLC</Trans>
        )}
      </Button>
      {loadFailed ? (
        <p role="alert" className="text-destructive text-sm">
          <Trans>Couldn't open installation. Follow the steps below or try again later.</Trans>
        </p>
      ) : null}
      {DialogComponent ? <DialogComponent open={open} onOpenChange={setOpen} /> : null}
    </div>
  );
}
