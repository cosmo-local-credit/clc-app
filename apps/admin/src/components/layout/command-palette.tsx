import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  HiOutlineCog,
  HiOutlineCollection,
  HiOutlineHome,
  HiOutlineLightningBolt,
  HiOutlineNewspaper,
  HiOutlineSwitchHorizontal,
  HiOutlineTicket,
  HiOutlineTag,
  HiOutlineUsers,
} from "react-icons/hi";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command";

// The three transaction pages are listed individually rather than as one
// "Transactions" entry. The palette is how an operator reaches a page without
// looking at the sidebar, so a section that resolves to a redirect is one hop
// short — and the labels are what they would have typed anyway.
const pages = [
  { to: "/", label: "Dashboard", icon: HiOutlineHome },
  { to: "/pools", label: "Pools", icon: HiOutlineCollection },
  { to: "/vouchers", label: "Vouchers", icon: HiOutlineTicket },
  { to: "/users", label: "Accounts", icon: HiOutlineUsers },
  { to: "/posts", label: "Posts", icon: HiOutlineNewspaper },
  { to: "/vocabulary", label: "Vocabulary", icon: HiOutlineTag },
  {
    to: "/transactions/vouchers",
    label: "Voucher transactions",
    icon: HiOutlineSwitchHorizontal,
  },
  { to: "/transactions/pools", label: "Pool transactions", icon: HiOutlineCollection },
  { to: "/transactions/otx", label: "Origin transactions (OTX)", icon: HiOutlineLightningBolt },
  { to: "/settings", label: "Settings", icon: HiOutlineCog },
] as const;

type PagePath = (typeof pages)[number]["to"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (to: PagePath) => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette">
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem key={page.to} value={page.label} onSelect={() => go(page.to)}>
              <page.icon className="size-4 opacity-70" />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
