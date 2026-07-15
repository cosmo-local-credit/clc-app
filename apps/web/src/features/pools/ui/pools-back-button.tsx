import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { RiArrowLeftLine } from "react-icons/ri";

import { cn } from "#/lib/utils";

export function PoolsBackButton({ label, className }: { label: string; className?: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();

  return (
    <button
      type="button"
      className={cn(
        "-ml-1.5 flex h-11 items-center gap-1.5 px-1.5 font-medium text-muted-foreground text-sm",
        className,
      )}
      onClick={() => {
        if (canGoBack) {
          router.history.back();
          return;
        }
        void navigate({ to: "/", search: { tab: "pool" } });
      }}
    >
      <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
