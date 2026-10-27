import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useCatalogShare } from "../hooks/use-catalog-share";

export function CatalogShareButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const { copyOnly, label, activate } = useCatalogShare({ id, name });
  const Icon = copyOnly ? RiFileCopyLine : RiShareLine;
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("border-0 text-muted-foreground", className)}
      aria-label={label}
      onClick={activate}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
