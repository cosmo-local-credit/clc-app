import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";

import { DeskCanvas } from "#/desktop/ui/page";
import { CatalogCreatePage } from "#/features/catalogs/ui/catalog-create-page";

export function CatalogCreateDesk({ intent }: { intent?: CatalogCreateIntent }) {
  return (
    <DeskCanvas width="read">
      <CatalogCreatePage intent={intent} embedded />
    </DeskCanvas>
  );
}
