import { Trans } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { EllipsizedAddress } from "#/components/wallet";

import type { LabelledRotationGroup, SkippedAsset } from "../api/discover-rotation-assets";
import { useRotationLabels } from "./rotation-labels";

/** What moves, then what stays and why. */
export function RotationAssetList({
  groups,
  skipped,
}: {
  groups: LabelledRotationGroup[];
  skipped: SkippedAsset[];
}) {
  const labels = useRotationLabels();
  return (
    <div className="border border-border bg-card">
      {groups.length === 0 ? (
        <p className="p-3 text-sm">
          <Trans>Nothing to move</Trans>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li
              key={`${group.kind}:${group.address}`}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">{group.label}</p>
                <EllipsizedAddress address={group.address} />
              </div>
              <Badge size="sm" variant="muted">
                {labels.kind(group.kind)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 ? (
        <ul className="divide-y divide-border border-border border-t">
          {skipped.map((asset) => (
            <li key={`${asset.kind}:${asset.address}:${asset.reason}`} className="p-3">
              <p className="truncate font-semibold text-sm">{asset.label}</p>
              <p className="text-destructive text-xs">{labels.reason(asset.reason)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
