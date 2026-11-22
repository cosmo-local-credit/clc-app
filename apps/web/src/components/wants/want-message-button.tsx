import type { Want } from "@clc/core/features/wants/logic";

import { ResourceMessageButton } from "#/components/messaging/resource-owner-contact";

/** The primary contact action on a public Want. */
export function WantMessageButton({ want }: { want: Want }) {
  return <ResourceMessageButton context={{ kind: "want", resourceId: want.id }} />;
}
