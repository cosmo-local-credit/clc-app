import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiDownloadLine, RiShareLine } from "react-icons/ri";

import { InstallAppButton } from "#/components/install-app-button";
import { Button } from "#/components/ui/button";
import { useInstallStore } from "#/features/install/install-store";

export function InstallAppLink({ openDialog = false }: { openDialog?: boolean }) {
  const installed = useInstallStore((state) => state.installed);
  if (openDialog && !installed) return <InstallAppButton showHelpLink />;
  const Icon = installed ? RiShareLine : RiDownloadLine;
  return (
    <Button asChild variant="outline" className="h-11 w-full">
      <Link to="/install">
        <Icon aria-hidden="true" />
        {installed ? <Trans>Share CLC</Trans> : <Trans>Install CLC</Trans>}
      </Link>
    </Button>
  );
}
