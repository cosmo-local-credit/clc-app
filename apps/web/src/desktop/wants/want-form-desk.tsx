import { DeskCanvas } from "#/desktop/ui/page";
import { WantFormPage } from "#/features/wants/ui/want-form-page";

/** New and edit share the phone form. There is no step list on that form. */
export function WantFormDesk({ wantId }: { wantId?: string }) {
  return (
    <DeskCanvas width="read">
      <WantFormPage id={wantId} embedded />
    </DeskCanvas>
  );
}
