import { ListToolbar } from "#/components/admin/list-toolbar";
import { transactionTypeFilterClass } from "#/components/admin/transaction-type-badge";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { cn } from "#/lib/utils";

/** Base UI needs a value for the unfiltered segment; event enums cannot contain it. */
const ALL_TYPES = "all";

/**
 * The filter bar the two chain-backed transaction pages share.
 *
 * The free-text term and event kind both live in the URL, then travel to the
 * backend together. `ListToolbar` debounces the term, so typing does not add a
 * history entry or start a page request for every character.
 */
export function ChainTxToolbar<TType extends string>({
  search,
  onSearchChange,
  searchPlaceholder,
  types,
  activeType,
  onTypeChange,
}: {
  search: string | undefined;
  onSearchChange: (search: string | undefined) => void;
  searchPlaceholder: string;
  types: readonly TType[];
  activeType: TType | undefined;
  onTypeChange: (type: TType | undefined) => void;
}) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={(value) => onSearchChange(value || undefined)}
      searchPlaceholder={searchPlaceholder}
      searchClassName="w-72"
      filters={
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[activeType ?? ALL_TYPES]}
          onValueChange={(values) => {
            const next = values[0] as TType | typeof ALL_TYPES | undefined;
            // Toggle groups let their active value be cleared. Keep the current
            // filter in that case; clicking the selected segment is a no-op.
            if (!next) return;
            onTypeChange(next === ALL_TYPES ? undefined : next);
          }}
          aria-label="Transaction types"
          className="border-border bg-card h-9 items-center border p-0.5"
        >
          <ToggleGroupItem
            value={ALL_TYPES}
            className="text-muted-foreground data-[pressed]:bg-muted data-[pressed]:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground h-full min-w-9 px-2.5 font-mono text-xs font-medium tracking-wide uppercase"
          >
            All
          </ToggleGroupItem>
          {types.map((type) => (
            <ToggleGroupItem
              key={type}
              value={type}
              className={cn(
                "h-full min-w-9 px-2.5 font-mono text-xs font-medium tracking-wide uppercase",
                transactionTypeFilterClass(type),
              )}
            >
              {type}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    />
  );
}
