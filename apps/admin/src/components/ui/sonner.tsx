import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiLoader4Line,
} from "react-icons/ri";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const toastClassNames = {
  toast:
    "relative flex w-80 items-start gap-3 border border-l-2 border-border bg-card px-3.5 py-3 pr-8 font-sans text-foreground text-[0.8125rem] shadow-none outline-none",
  title: "font-heading font-semibold leading-tight tracking-[-0.01em] text-foreground",
  description: "mt-1 font-body text-muted-foreground text-xs leading-snug",
  content: "min-w-0 flex-1",
  icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center",
  actionButton:
    "ml-auto inline-flex h-8 shrink-0 items-center justify-center border border-transparent bg-primary px-2.5 text-primary-foreground text-xs font-semibold transition-colors hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
  cancelButton:
    "ml-auto inline-flex h-8 shrink-0 items-center justify-center border border-border bg-card px-2.5 text-foreground text-xs font-semibold transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
  success: "border-l-primary",
  error: "border-l-destructive",
  info: "border-l-foreground",
  warning: "border-l-state-pending",
  loading: "border-l-muted-foreground",
  default: "border-l-foreground",
} satisfies NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]>;

const toastIcons = {
  success: <RiCheckboxCircleLine className="size-4 text-primary" aria-hidden="true" />,
  error: <RiErrorWarningLine className="size-4 text-destructive" aria-hidden="true" />,
  info: <RiInformationLine className="size-4 text-foreground" aria-hidden="true" />,
  warning: <RiAlertLine className="size-4 text-state-pending" aria-hidden="true" />,
  loading: (
    <RiLoader4Line className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
  ),
} satisfies ToasterProps["icons"];

export function Toaster() {
  return (
    <Sonner
      duration={3500}
      expand
      gap={8}
      icons={toastIcons}
      offset={{ top: "1rem", right: "1rem" }}
      position="top-right"
      swipeDirections={["top", "right"]}
      toastOptions={{
        unstyled: true,
        classNames: toastClassNames,
      }}
      visibleToasts={3}
    />
  );
}
