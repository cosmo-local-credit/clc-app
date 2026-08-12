/**
 * The operator controls for one account: approval state and per-account limits.
 *
 * The record comes from the directory query rather than a per-account request,
 * because clc-core has no "get one admin user" endpoint — `/admin/users` returns
 * every row, so the account is found in that list. An address with no row is a
 * real case, not an error: the pools and vouchers surfaces link to addresses that
 * hold tokens without necessarily having a CLC account.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { formatDateTime } from "#/lib/format";
import {
  useAdminUsers,
  useApproveUser,
  useRejectUser,
  useUpdateUserLimits,
} from "../use-admin-users";

export function AccountAdminPanel({ address }: { address: string }) {
  const usersQuery = useAdminUsers();
  const approve = useApproveUser();
  const reject = useRejectUser();
  const updateLimits = useUpdateUserLimits();

  const user = usersQuery.data?.find(
    (candidate) => candidate.ethereumAddress.toLowerCase() === address.toLowerCase(),
  );

  const [maxPools, setMaxPools] = useState("");
  const [maxTokens, setMaxTokens] = useState("");

  // Seeded from the server record, and re-seeded when it changes so a successful
  // save leaves the fields showing what was actually stored rather than what was
  // typed.
  useEffect(() => {
    if (!user) return;
    setMaxPools(String(user.maxPools));
    setMaxTokens(String(user.maxTokens));
  }, [user]);

  if (usersQuery.isPending) {
    return <Panel>Loading account…</Panel>;
  }

  if (usersQuery.isError) {
    return (
      <Panel>
        <span className="text-destructive">
          Could not load the account record
          {usersQuery.error instanceof Error ? `: ${usersQuery.error.message}` : "."}
        </span>
      </Panel>
    );
  }

  if (!user) {
    return (
      <Panel>
        This address has no CLC account. It can hold and receive vouchers, but there is nothing to
        approve or limit.
      </Panel>
    );
  }

  const parsedPools = Number(maxPools);
  const parsedTokens = Number(maxTokens);
  const limitsValid =
    Number.isInteger(parsedPools) &&
    parsedPools >= 0 &&
    Number.isInteger(parsedTokens) &&
    parsedTokens >= 0;
  const limitsChanged = parsedPools !== user.maxPools || parsedTokens !== user.maxTokens;
  const busy = approve.isPending || reject.isPending || updateLimits.isPending;

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request failed.");
    }
  }

  return (
    <div className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2">
      <dl className="space-y-2 text-sm">
        <Row label="Name">{user.name || <Muted>unnamed</Muted>}</Row>
        <Row label="Email">{user.email || <Muted>none</Muted>}</Row>
        <Row label="Phone">{user.phone || <Muted>none</Muted>}</Row>
        <Row label="Role">
          <span className="font-data text-xs">{user.role}</span>
        </Row>
        <Row label="Status">
          <StateBadge state={user.status} kind="account" />
        </Row>
        <Row label="Joined">
          <span className="font-data text-xs">{formatDateTime(user.createdAt)}</span>
        </Row>
      </dl>

      <div className="space-y-4">
        <div className="space-y-2">
          <SectionLabel>Approval</SectionLabel>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || user.status === "APPROVED"}
              onClick={() =>
                void run("Account approved.", () => approve.mutateAsync(user.ethereumAddress))
              }
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || user.status === "REJECTED"}
              onClick={() =>
                void run("Account rejected.", () => reject.mutateAsync(user.ethereumAddress))
              }
            >
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </div>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!limitsValid || !limitsChanged) return;
            void run("Limits updated.", () =>
              updateLimits.mutateAsync({
                address: user.ethereumAddress,
                // Both are always sent: the endpoint replaces the pair rather
                // than patching one of them.
                limits: { maxPools: parsedPools, maxTokens: parsedTokens },
              }),
            );
          }}
        >
          <SectionLabel>Limits</SectionLabel>
          <div className="flex flex-wrap items-end gap-2">
            <LimitField label="Max pools" value={maxPools} onChange={setMaxPools} disabled={busy} />
            <LimitField
              label="Max vouchers"
              value={maxTokens}
              onChange={setMaxTokens}
              disabled={busy}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || !limitsValid || !limitsChanged}
            >
              {updateLimits.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          {!limitsValid ? (
            <p className="text-destructive text-xs">
              Both limits must be whole numbers, 0 or more.
            </p>
          ) : null}
          {/*
            Saving currently fails against clc-core with E02 "Invalid or malformed
            request", including for a hand-rolled curl with this exact payload.
            adminUpdateUserLimitsHandler calls c.Bind twice — once for the address
            param and once for the body — and the first call consumes the body, so
            the second fails. The client side is correct and needs no change when
            that is fixed; delete this note then.
          */}
          <p className="text-muted-foreground text-xs">
            Saving limits is currently rejected by the backend (E02). The approval buttons above are
            unaffected.
          </p>
        </form>
      </div>
    </div>
  );
}

function LimitField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-muted-foreground text-xs">{label}</span>
      <Input
        // `inputMode` rather than `type="number"`: a number input silently yields
        // an empty string for invalid text, which would read as 0.
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-24 font-data"
      />
    </label>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="border border-border bg-card p-4 text-sm">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
