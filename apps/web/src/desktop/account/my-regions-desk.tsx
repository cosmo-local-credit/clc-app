import { Trans, useLingui } from "@lingui/react/macro";

import { MyRegions } from "#/components/regions/my-regions";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";

export function MyRegionsDesk({ viewer }: { viewer?: string }) {
  const { t } = useLingui();
  return (
    <DeskCanvas width="read" className="grid-cols-[minmax(0,760px)]">
      <div>
        <BackChevron label={t`Settings`} to="/" search={{ tab: "settings" }} />
        <DeskTitle>
          <Trans>My regions</Trans>
        </DeskTitle>
      </div>
      <MyRegions viewer={viewer} />
    </DeskCanvas>
  );
}
