import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { useShareLink } from "#/hooks/use-share-link";
import { cn } from "#/lib/utils";

export function ShareLinkButton({
  title,
  path,
  variant = "ghost",
  size = "icon-lg",
  className,
}: {
  title: string;
  path: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "icon-lg";
  className?: string;
}) {
  const { copyOnly, label, activate } = useShareLink({ title, path });
  const Icon = copyOnly ? RiFileCopyLine : RiShareLine;
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("shrink-0 text-muted-foreground", className)}
      aria-label={label}
      onClick={activate}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
