import type { AdminUser } from "@clc/api/features/admin/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { StateBadge } from "#/components/admin/state-badge";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { formatDateTime } from "#/lib/format";
import { useApproveUser, useRejectUser } from "../use-admin-users";

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
 * `account` is null for an address that holds vouchers without having registered.
 * The header still renders — the address is the one thing that is certainly real
 * — and offers no actions, because there is no account to approve.
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
  const busy = approve.isPending || reject.isPending;

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
          <Avatar className="size-16 shrink-0 border border-border">
            <AvatarFallback className="font-heading text-xl">{initials(name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="min-w-0 break-words">{name}</h1>

            <div className="flex items-center gap-1">
              <span className="font-data text-xs break-all text-muted-foreground">{address}</span>
              <CopyButton value={address} label="Copy address" />
            </div>

            {account ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <StateBadge state={account.status} kind="account" />
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  {account.role}
                </Badge>
                {/* The account ID belongs with the identity rather than buried in a
                    metadata strip: it is what an operator quotes in a ticket, so it
                    gets the same badge treatment as the role beside it. */}
                <Badge variant="outline" className="font-data text-xs">
                  ID {account.id}
                </Badge>
                <span className="font-data text-xs text-muted-foreground">
                  Joined {formatDateTime(account.createdAt)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {account ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Approval stays a button of its own: it is the decision an operator
                opened a pending account to make, and burying it in a menu costs a
                click on the screen's whole purpose. Everything else is a menu
                item. */}
            {account.status !== "APPROVED" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run("Account approved.", () => approve.mutateAsync(account.ethereumAddress))
                }
              >
                {approve.isPending ? "Approving…" : "Approve account"}
              </Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" disabled={busy}>
                    Actions
                    <ChevronDownIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEditProfile}>Edit profile</DropdownMenuItem>
                {account.status !== "REJECTED" ? (
                  // "Ban user" over "Reject": the same endpoint serves both a
                  // never-approved signup and an account being shut out later, and only
                  // the second reads as rejection. The stored status stays REJECTED, so
                  // the badge is unchanged.
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      void run("User banned.", () => reject.mutateAsync(account.ethereumAddress))
                    }
                  >
                    {reject.isPending ? "Banning…" : "Ban user"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Up to two initials from the account name. Falls back to one character so the
 * circle is never empty, which would read as a failed image rather than as an
 * account without a photo.
 */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase();
}
