import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "react-icons/ri";
import { Toaster, type ToasterProps } from "sonner";
import { getLocaleDirection } from "@clc/i18n/locales";
import { Spinner } from "#/components/ui/spinner";
import { useLocale } from "#/providers/i18n";

const toastClassNames = {
  toast:
    "relative flex w-[calc(100vw-2rem)] items-start gap-3 rounded-none border border-s-2 border-border bg-card px-3.5 py-3 pe-8 font-sans text-foreground text-sm shadow-none outline-none",
  title: "font-heading font-semibold leading-tight tracking-[-0.01em] text-foreground",
  description: "mt-1 font-body text-muted-foreground text-xs leading-snug",
  content: "min-w-0 flex-1",
  icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center",
  actionButton:
    "ms-auto inline-flex h-8 shrink-0 items-center justify-center rounded-none border border-transparent bg-primary px-2.5 text-primary-foreground text-xs font-semibold transition-colors hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
  cancelButton:
    "ms-auto inline-flex h-8 shrink-0 items-center justify-center rounded-none border border-border bg-card px-2.5 text-foreground text-xs font-semibold transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
  success: "border-s-primary",
  error: "border-s-destructive",
  info: "border-s-foreground",
  warning: "border-s-[oklch(0.74_0.16_80)]",
  loading: "border-s-muted-foreground",
  default: "border-s-foreground",
} satisfies NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]>;

const toastIcons = {
  success: <RiCheckboxCircleLine className="size-4 text-primary" aria-hidden="true" />,
  error: <RiErrorWarningLine className="size-4 text-destructive" aria-hidden="true" />,
  info: <RiInformationLine className="size-4 text-foreground" aria-hidden="true" />,
  warning: <RiAlertLine className="size-4 text-[oklch(0.58_0.14_70)]" aria-hidden="true" />,
  loading: <Spinner className="text-muted-foreground" />,
} satisfies ToasterProps["icons"];

export function AppToaster() {
  const { locale } = useLocale();
  const isRtl = getLocaleDirection(locale) === "rtl";

  return (
    <Toaster
      duration={3500}
      gap={8}
      icons={toastIcons}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top) + 0.75rem)",
        right: "1rem",
        left: "1rem",
      }}
      offset={{ top: "1rem", right: "1rem", left: "1rem" }}
      position={isRtl ? "top-left" : "top-right"}
      swipeDirections={["top", isRtl ? "left" : "right"]}
      toastOptions={{
        unstyled: true,
        classNames: toastClassNames,
      }}
      visibleToasts={3}
    />
  );
}
