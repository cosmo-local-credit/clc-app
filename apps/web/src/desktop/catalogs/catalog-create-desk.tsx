import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";

import { DeskCanvas } from "#/desktop/ui/page";
import { CatalogCreatePage } from "#/features/catalogs/ui/catalog-create-page";
import { cn } from "#/lib/utils";

/** The phone form in a 560px column, its submit as a `.form-foot`: a rule, the button at the end. */
const FORM_CLASS = cn(
  "[&_form]:flex [&_form]:flex-col [&_form]:gap-5 [&_form]:space-y-0",
  "[&_form>button[type=submit]]:order-2 [&_form>button[type=submit]]:w-auto [&_form>button[type=submit]]:self-end",
  "[&_form]:after:order-1 [&_form]:after:border-border [&_form]:after:border-t",
);

export function CatalogCreateDesk({ intent }: { intent?: CatalogCreateIntent }) {
  return (
    <DeskCanvas width="read" className="grid-cols-[minmax(0,560px)]">
      <div className={cn("min-w-0", FORM_CLASS)}>
        <CatalogCreatePage intent={intent} embedded />
      </div>
    </DeskCanvas>
  );
}
