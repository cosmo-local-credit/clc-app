import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { HiOutlineClipboard, HiOutlineCog, HiOutlineLogout } from "react-icons/hi";

import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useAdminSession, useAdminSignOut } from "#/features/auth/admin-session";
import { useOperatorProfile } from "#/features/auth/use-operator-profile";
import { copyText } from "#/lib/copy";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";

/**
 * Who is signed in, and the way out.
 *
 * The shell only renders inside AuthBoundary's authenticated branch, so the
 * session is known — but it is read rather than passed down so no surface has to
 * thread it through.
 */
export function OperatorMenu() {
  const session = useAdminSession();
  const signOut = useAdminSignOut();
  const profile = useOperatorProfile();

  if (session.status !== "authenticated") return null;

  const address = session.operator.address;
  const shortened = formatVoucherAddress(address as `0x${string}`);
  const name = profile.data?.name.trim();
  const label = name || shortened;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="max-w-[16rem] gap-1.5 px-2"
            aria-label={`${label}, account menu`}
          />
        }
      >
        {profile.isPending && !name ? (
          <span className="inline-block h-3.5 w-24 animate-pulse bg-muted" aria-hidden />
        ) : (
          <span className="truncate font-heading text-sm font-medium tracking-tight">{label}</span>
        )}
        <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-aria-expanded/button:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 min-w-56">
        {name ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-heading text-sm font-semibold tracking-tight text-foreground">
              {name}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}

        {name ? <DropdownMenuSeparator /> : null}

        <DropdownMenuItem
          aria-label="Copy address"
          onClick={() => {
            void copyText(address, "Copy address");
          }}
        >
          <HiOutlineClipboard />
          <span className="font-data">{shortened}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link to="/settings" />}>
          <HiOutlineCog />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          <HiOutlineLogout />
          {signOut.isPending ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
