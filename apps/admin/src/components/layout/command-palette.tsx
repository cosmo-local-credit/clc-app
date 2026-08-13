import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  HiOutlineCog,
  HiOutlineCollection,
  HiOutlineHome,
  HiOutlineTicket,
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

const pages = [
  { to: "/", label: "Overview", icon: HiOutlineHome },
  { to: "/pools", label: "Pools", icon: HiOutlineCollection },
  { to: "/vouchers", label: "Vouchers", icon: HiOutlineTicket },
  { to: "/users", label: "Accounts", icon: HiOutlineUsers },
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
