import type { UserPool } from "@clc/api/features/pools/client";
import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { usePoolProfileForm } from "#/features/pools/hooks/use-pool-profile-form";

import { PoolProfileFields } from "./pool-profile-fields";

/**
 * The owner's edit surface for their pool's catalog record: every field the
 * create flow asked for, minus the chain facts a redeploy would be needed to
 * change. A bottom sheet over the pool screen, the same shape as the voucher
 * editor, so the saved record lands where it is read.
 */
export function PoolProfileEditorSheet({
  open,
  pool,
  privateInfo,
  onClose,
}: {
  open: boolean;
  pool: UserPool;
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
  onClose: () => void;
}) {
  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <Trans>Edit pool details</Trans>
            </SheetTitle>
          </SheetHeader>
          {/* Mounted only while open so each visit reads the current record:
              TanStack Form takes defaultValues once. */}
          {open && privateInfo?.isPending ? (
            <p aria-busy="true" className="px-4 py-3 text-sm text-muted-foreground">
              <Trans>Loading pool information…</Trans>
            </p>
          ) : null}
          {open && privateInfo?.isError ? (
            <div role="alert" className="space-y-3 px-4 py-3 text-sm">
              <p>
                <Trans>Couldn't load pool information.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={privateInfo.isFetching}
                onClick={privateInfo.retry}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
          {open && !privateInfo?.isPending && !privateInfo?.isError ? (
            <PoolProfileForm pool={pool} onClose={onClose} />
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PoolProfileForm({ pool, onClose }: { pool: UserPool; onClose: () => void }) {
  const profile = usePoolProfileForm({ pool, onClose });
  const { form, update, imageBusy } = profile;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <PoolProfileFields pool={pool} profile={profile} />
      </div>

      <SheetFooter>
        <Button type="submit" tap className="w-full" pending={update.isPending || imageBusy}>
          {imageBusy ? (
            <Trans>Uploading…</Trans>
          ) : update.isPending ? (
            <Trans>Saving…</Trans>
          ) : (
            <Trans>Save changes</Trans>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          tap
          className="w-full"
          disabled={update.isPending}
          onClick={onClose}
        >
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </form>
  );
}
