import type { Catalog } from "@clc/core/features/catalogs/logic";
import { Link } from "@tanstack/react-router";
import { RiBookOpenLine } from "react-icons/ri";
import { Badge } from "#/components/ui/badge";
import { ProgressiveImage } from "#/components/ui/progressive-image";

export function CatalogPicture({ url }: { url: string | null }) {
  return (
    <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden border border-border bg-card">
      {url ? (
        <ProgressiveImage src={url} alt="" className="size-full object-cover" />
      ) : (
        <RiBookOpenLine className="size-6 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

export function CatalogRow({
  catalog,
  distanceLabel,
}: {
  catalog: Catalog;
  distanceLabel?: string;
}) {
  return (
    <Link
      to="/catalogs/$catalogId"
      params={{ catalogId: catalog.id }}
      className="flex min-h-24 items-center gap-3 border border-border bg-card p-3"
    >
      <CatalogPicture url={catalog.imageUrl} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block break-words text-sm font-semibold">
          {catalog.name}
        </span>
        <span dir="auto" className="mt-1 block text-xs text-muted-foreground">
          {catalog.locationName}
        </span>
        {catalog.description ? (
          <span
            dir="auto"
            className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground"
          >
            {catalog.description}
          </span>
        ) : null}
        {catalog.tags.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {catalog.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" size="sm">
                {tag}
              </Badge>
            ))}
          </span>
        ) : null}
        {distanceLabel ? (
          <span className="mt-1 block text-xs text-muted-foreground">{distanceLabel}</span>
        ) : null}
      </span>
    </Link>
  );
}
