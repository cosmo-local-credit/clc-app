import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiDownloadLine, RiShareLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useInstallStore } from "#/features/install/install-store";

export function InstallAppLink() {
  const installed = useInstallStore((state) => state.installed);
  const Icon = installed ? RiShareLine : RiDownloadLine;
  return (
    <Button asChild variant="outline" tap className="w-full">
      <Link to="/install">
        <Icon aria-hidden="true" />
        {installed ? <Trans>Share CLC</Trans> : <Trans>Install CLC</Trans>}
      </Link>
    </Button>
  );
}
