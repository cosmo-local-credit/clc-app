import type { AdminUser } from "@clc/api/features/admin/client";
import { mayActOnAccount } from "@clc/core/features/account-retirement/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { isSuperAdminRole, isUserRole } from "@clc/core/features/users/roles";
import { HiOutlineExternalLink, HiOutlinePencil } from "react-icons/hi";
import { useState } from "react";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { CopyButton } from "#/components/admin/copy-button";
import { StateBadge } from "#/components/admin/state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { addressUrl } from "#/lib/explorer";
import { formatDateTime, initials } from "#/lib/format";
import { cn } from "#/lib/utils";
import { useAdminSession } from "#/features/auth/admin-session";
import { KEY_ROTATION_ENABLED } from "#/lib/key-rotation-config";
import { useApproveUser, useRejectUser, useUpdateUserRole } from "../use-admin-users";
import { useRestoreAccount } from "../use-account-retirement";
import { AccountLifecycleBadge } from "./account-lifecycle-badge";
import { ModerationDialog } from "./moderation-dialog";
import { ReplaceCardDialog } from "./replace-card-dialog";
import { RetireAccountSheet } from "./retire-account-sheet";

/** Shown when an account has no name, so the title is never an empty line. */
const UNNAMED = "Unnamed account";

/**
 * Identity on the left, operator actions on the right.
 *
 * The actions are the account's whole administrative surface: approval lives
 * here rather than in a panel below, because an operator opening this screen is
 * usually here to act on the account, and burying the decision under the profile
 * put it below the fold on a laptop.
 *
 * The explorer jump comes first, as it does on the pool and voucher headers: an
 * address is worth verifying on chain whatever kind of record it belongs to, and
 * an operator should not have to learn a different place to find that per screen.
 * The decisions that change something sit to its right.
 *
 * There is deliberately no "Transactions" jump to match those two screens. The
 * transactions pages filter by voucher and by pool, not by participant, so the
 * button would land on an unfiltered table — and this account's transfers already
 * page in full in the records tab below.
 *
 * `account` is null for an address that holds vouchers without having registered.
 * The header still renders — the address is the one thing that is certainly real,
 * and the explorer jump still works — but offers no decisions, because there is
 * no account to approve. The "No account" chip stands in for the status badge so
 * the identity block does not lose a line and shift the address up.
 */
export function AccountHeader({
  address,
  account,
  onEditProfile,
}: {
  address: string;
  account: AdminUser | null;
  onEditProfile: () => void;
}) {
  const approve = useApproveUser();
  const reject = useRejectUser();
  const updateRole = useUpdateUserRole();
  const restore = useRestoreAccount();
  const session = useAdminSession();
  const [roleTarget, setRoleTarget] = useState<"ADMIN" | "USER" | null>(null);
  const [replacingCard, setReplacingCard] = useState(false);
  const [moderation, setModeration] = useState<"ban" | "unban" | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const busy = approve.isPending || reject.isPending || updateRole.isPending || restore.isPending;
  const canManageRoles =
    session.status === "authenticated" && isSuperAdminRole(session.operator.role);
  // clc-core refuses the operator's own account and any superadmin's.
  const canReplaceCard =
    KEY_ROTATION_ENABLED &&
    canManageRoles &&
    account !== null &&
    !isSuperAdminRole(account.role) &&
    session.status === "authenticated" &&
    session.operator.address.toLowerCase() !== account.ethereumAddress.toLowerCase();

  // Ban, Unban and Retire follow the role hierarchy. clc-core refuses the rest
  // with a 403; the console just does not offer what it knows will be refused.
  const operator = session.status === "authenticated" ? session.operator : null;
  const mayAct =
    account !== null &&
    operator !== null &&
    isUserRole(operator.role) &&
    mayActOnAccount(
      { role: operator.role, address: operator.address },
      { role: account.role, address: account.ethereumAddress },
    );
  const lifecycle = account?.lifecycle ?? "ACTIVE";
  const canRetire = mayAct && lifecycle === "ACTIVE";
  const canRestore =
    mayAct &&
    lifecycle === "RETIREMENT_SCHEDULED" &&
    !!account?.closesAt &&
    new Date(account.closesAt).getTime() > Date.now();

  const name = account?.name?.trim() ? account.name : UNNAMED;

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request failed.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: "Accounts", to: "/users" },
          { label: formatVoucherAddress(address as `0x${string}`) },
        ]}
      />

      {/* Actions wrap below the identity block on narrow admin widths; the avatar
          and the name keep their size rather than shrinking to hold one row. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="border-border size-16 shrink-0 border">
            {/* Initials remain the fallback, and not only for accounts without a
                photo: the CDN can be unreachable, and a broken image in the
                identity block is worse than the letters. */}
            {account?.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
            <AvatarFallback className="font-heading text-xl">{initials(name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="min-w-0 break-words">{name}</h1>

            {/* A username can be the display name itself, so it needs its own
                label. It stays with the title: the records tab is what this
                screen is usually opened on, and the record card sits below it. */}
            {account ? (
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-muted-foreground shrink-0 text-xs">Username</span>
                {account.username ? (
                  <span className="min-w-0 font-mono text-xs break-words">{account.username}</span>
                ) : (
                  <span className="text-muted-foreground font-mono text-xs">None</span>
                )}
              </div>
            ) : null}

            <div className="flex items-center gap-1">
              <span className="font-data text-muted-foreground text-xs break-all">{address}</span>
              <CopyButton value={address} label="Copy address" />
            </div>

            {account ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <StateBadge state={account.status} kind="account" />
                <AccountLifecycleBadge lifecycle={account.lifecycle} closesAt={account.closesAt} />
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  {account.role}
                </Badge>
                {/* The account ID belongs with the identity rather than buried in a
                    metadata strip: it is what an operator quotes in a ticket, so it
                    gets the same badge treatment as the role beside it. */}
                <Badge variant="outline" className="font-data text-xs">
                  ID {account.id}
                </Badge>
                <span className="font-data text-muted-foreground text-xs">
                  Joined {formatDateTime(account.createdAt)}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  No account
                </Badge>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <HiOutlineExternalLink />
            Explorer
          </a>
          {account ? (
            <>
              {/* Every action is a button. There were three of them behind a menu
                  labelled "Actions", which named the mechanism rather than the
                  choice and cost a click to read a two-item list. Approval leads
                  because it is the decision a pending account is opened to make;
                  banning is last and styled as the destructive thing it is. */}
              {mayAct && account.status === "PENDING" ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run("Account approved.", () =>
                      approve.mutateAsync({ address: account.ethereumAddress }),
                    )
                  }
                >
                  {approve.isPending ? "Approving…" : "Approve account"}
                </Button>
              ) : null}
              {mayAct && account.status === "REJECTED" ? (
                <Button size="sm" disabled={busy} onClick={() => setModeration("unban")}>
                  Unban user
                </Button>
              ) : null}

              <Button size="sm" variant="outline" disabled={busy} onClick={onEditProfile}>
                <HiOutlinePencil />
                Edit profile
              </Button>

              {canManageRoles && account.role === "USER" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRoleTarget("ADMIN")}
                >
                  Make admin
                </Button>
              ) : null}
              {canManageRoles && account.role === "ADMIN" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRoleTarget("USER")}
                >
                  Make user
                </Button>
              ) : null}

              {canReplaceCard ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReplacingCard(true)}
                >
                  Move to a new card
                </Button>
              ) : null}

              {canRestore ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRestoring(true)}
                >
                  Restore account
                </Button>
              ) : null}
              {canRetire ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setRetiring(true)}
                >
                  Retire account
                </Button>
              ) : null}

              {mayAct && account.status !== "REJECTED" ? (
                // "Ban user" over "Reject": the same endpoint serves both a
                // never-approved signup and an account being shut out later, and only
                // the second reads as rejection. The stored status stays REJECTED, so
                // the badge is unchanged.
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setModeration("ban")}
                >
                  Ban user
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {account && replacingCard ? (
        <ReplaceCardDialog
          address={account.ethereumAddress}
          name={account.name}
          onClose={() => setReplacingCard(false)}
        />
      ) : null}

      {account && moderation ? (
        <ModerationDialog
          action={moderation}
          pending={moderation === "ban" ? reject.isPending : approve.isPending}
          onCancel={() => setModeration(null)}
          onConfirm={(reason) => {
            const request = { address: account.ethereumAddress, reason };
            void run(moderation === "ban" ? "User banned." : "User unbanned.", () =>
              (moderation === "ban" ? reject : approve).mutateAsync(request).then((user) => {
                setModeration(null);
                return user;
              }),
            );
          }}
        />
      ) : null}

      {account && retiring ? (
        <RetireAccountSheet
          address={account.ethereumAddress}
          name={name}
          open
          onClose={() => setRetiring(false)}
        />
      ) : null}

      {account && restoring ? (
        <ConfirmDialog
          open
          title="Restore this account?"
          description="The account returns to ordinary use and its hidden posts, reviews, wants and catalogs become visible again. A ban is not lifted."
          confirmLabel="Restore account"
          pending={restore.isPending}
          onCancel={() => setRestoring(false)}
          onConfirm={() =>
            void run("Account restored.", () =>
              restore.mutateAsync(account.ethereumAddress).then((state) => {
                setRestoring(false);
                return state;
              }),
            )
          }
        />
      ) : null}

      {account && roleTarget ? (
        <ConfirmDialog
          open
          title={roleTarget === "ADMIN" ? "Make this user an admin?" : "Remove admin access?"}
          description={
            roleTarget === "ADMIN"
              ? "This account will gain access to the Admin console and all administrative operations except role management."
              : "This account will immediately lose administrative access."
          }
          confirmLabel={roleTarget === "ADMIN" ? "Make admin" : "Make user"}
          destructive={roleTarget === "USER"}
          pending={updateRole.isPending}
          onCancel={() => setRoleTarget(null)}
          onConfirm={() =>
            void run(roleTarget === "ADMIN" ? "User made admin." : "Admin made user.", () =>
              updateRole
                .mutateAsync({ address: account.ethereumAddress, role: roleTarget })
                .then((user) => {
                  setRoleTarget(null);
                  return user;
                }),
            )
          }
        />
      ) : null}
    </div>
  );
}
