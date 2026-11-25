import { useShareLink } from "#/hooks/use-share-link";

/**
 * Share a catalog's link. After the share sheet fails once, the action
 * becomes Copy link.
 */
export function useCatalogShare({ id, name }: { id: string; name: string }) {
  return useShareLink({ title: name, path: `/catalogs/${encodeURIComponent(id)}` });
}
