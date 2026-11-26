import { adminKeys, adminUserQueryOptions } from "@clc/api/features/admin/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { Region } from "@clc/core/features/regions/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getAddress, isAddress } from "viem";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";

export function RegionAssignments({
  region,
  superadmin,
  onSaved,
}: {
  region: Region;
  superadmin: boolean;
  onSaved: (region: Region) => void;
}) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
  const [lookupAddress, setLookupAddress] = useState<string>();
  const [removeAddress, confirmRemoval] = useState<string | null>(null);
  const [convert, setConvert] = useState(false);
  const lookup = useQuery(adminUserQueryOptions(clcApi.admin, lookupAddress));
  const account = lookupAddress && lookup.isSuccess ? lookup.data : null;
  const assigned =
    account &&
    region.assignedAdmins.some(
      (admin) => admin.address.toLowerCase() === account.ethereumAddress.toLowerCase(),
    );
  const canConvert = !!account && account.role === "ADMIN" && superadmin;
  const canAssign =
    !!account &&
    account.status === "APPROVED" &&
    (!account.lifecycle || account.lifecycle === "ACTIVE") &&
    (account.role === "USER" || account.role === "REGIONAL_ADMIN" || (canConvert && convert)) &&
    !assigned;
  const update = useMutation({
    mutationFn: ({
      target,
      assigned,
      confirm,
    }: {
      target: string;
      assigned: boolean;
      confirm: boolean;
    }) => clcApi.regions.setAssignment(region.id, target, assigned, confirm),
    onSuccess: (updated, { target, assigned }) => {
      onSaved(updated);
      if (assigned) {
        setAddress("");
        setLookupAddress(undefined);
        setConvert(false);
      } else {
        confirmRemoval(null);
      }
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(target), exact: true });
      void queryClient.invalidateQueries({ queryKey: ["clc", "admin", "users", "page"] });
    },
  });

  return (
    <section aria-labelledby="region-staff-heading" className="space-y-3">
      <h3 id="region-staff-heading">Regional admins</h3>
      {region.assignedAdmins.length ? (
        <ul className="divide-y divide-border border border-border">
          {region.assignedAdmins.map(({ address, username }) => (
            <li key={address} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <span className="text-sm">
                {username ? <span className="me-2 font-medium">{username}</span> : null}
                <span className="font-mono text-xs" title={address}>
                  {formatVoucherAddress(address as `0x${string}`)}
                </span>
              </span>
              {region.active ? (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${username ?? address} from the region`}
                  disabled={update.isPending}
                  onClick={() => {
                    update.reset();
                    confirmRemoval(address);
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No regional admins assigned. Global admins manage this region.
        </p>
      )}
      {removeAddress ? (
        <div className="space-y-2 border border-border bg-muted p-3">
          <p className="text-sm">
            Remove regional access for this account? Other region assignments stay in place.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ target: removeAddress, assigned: false, confirm: false })
              }
            >
              Confirm removal
            </Button>
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => confirmRemoval(null)}
            >
              Keep assignment
            </Button>
          </div>
        </div>
      ) : null}
      {region.active ? (
        <>
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isAddress(address.trim(), { strict: false })) return;
              setLookupAddress(getAddress(address.trim().toLowerCase()));
            }}
          >
            <label className="text-sm font-medium" htmlFor="region-admin-address">
              Assign by wallet address
            </label>
            <div className="flex gap-2">
              <Input
                id="region-admin-address"
                className="font-mono"
                value={address}
                placeholder="0x…"
                autoComplete="off"
                disabled={update.isPending}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setLookupAddress(undefined);
                  setConvert(false);
                  update.reset();
                }}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!isAddress(address.trim(), { strict: false }) || update.isPending}
              >
                Find account
              </Button>
            </div>
          </form>
          {lookupAddress && lookup.isPending ? (
            <p role="status" className="text-sm">
              Looking up account…
            </p>
          ) : null}
          {lookupAddress && lookup.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>Couldn’t verify this account. {errorMessage(lookup.error)}</p>
              <Button variant="outline" onClick={() => void lookup.refetch()}>
                Retry lookup
              </Button>
            </div>
          ) : null}
          {lookupAddress && lookup.isSuccess && !account ? (
            <p className="text-sm">No account matches this wallet address.</p>
          ) : null}
          {account ? (
            <div className="grid justify-items-start gap-2 border border-border p-3">
              <p className="text-sm">
                {account.username ?? account.name} · {account.role} · {account.status}
              </p>
              {assigned ? <p className="text-sm">Already assigned to this region.</p> : null}
              {canConvert ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={convert}
                    onChange={(event) => setConvert(event.target.checked)}
                  />
                  Replace this account’s global admin access with regional access.
                </label>
              ) : account.role === "ADMIN" || account.role === "SUPERADMIN" ? (
                <p className="text-sm">This account cannot be assigned by your role.</p>
              ) : null}
              <Button
                disabled={!canAssign || update.isPending || lookup.isFetching}
                onClick={() =>
                  update.mutate({
                    target: account.ethereumAddress,
                    assigned: true,
                    confirm: canConvert && convert,
                  })
                }
              >
                {update.isPending ? "Saving…" : "Assign regional admin"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(update.error)}
        </p>
      ) : null}
    </section>
  );
}
