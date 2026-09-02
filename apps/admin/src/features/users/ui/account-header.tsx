import type { AdminUser } from "@clc/api/features/admin/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { HiOutlineExternalLink, HiOutlinePencil } from "react-icons/hi";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { StateBadge } from "#/components/admin/state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { addressUrl } from "#/lib/explorer";
import { formatDateTime, initials } from "#/lib/format";
import { cn } from "#/lib/utils";
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
          <Avatar className="border-border size-16 shrink-0 border">
            {/* Initials remain the fallback, and not only for accounts without a
                photo: the CDN can be unreachable, and a broken image in the
                identity block is worse than the letters. */}
            {account?.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
            <AvatarFallback className="font-heading text-xl">{initials(name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="min-w-0 break-words">{name}</h1>

            <div className="flex items-center gap-1">
              <span className="font-data text-muted-foreground text-xs break-all">{address}</span>
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
              {account.status !== "APPROVED" ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run("Account approved.", () =>
                      approve.mutateAsync(account.ethereumAddress),
                    )
                  }
                >
                  {approve.isPending ? "Approving…" : "Approve account"}
                </Button>
              ) : null}

              <Button size="sm" variant="outline" disabled={busy} onClick={onEditProfile}>
                <HiOutlinePencil />
                Edit profile
              </Button>

              {account.status !== "REJECTED" ? (
                // "Ban user" over "Reject": the same endpoint serves both a
                // never-approved signup and an account being shut out later, and only
                // the second reads as rejection. The stored status stays REJECTED, so
                // the badge is unchanged.
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void run("User banned.", () => reject.mutateAsync(account.ethereumAddress))
                  }
                >
                  {reject.isPending ? "Banning…" : "Ban user"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
