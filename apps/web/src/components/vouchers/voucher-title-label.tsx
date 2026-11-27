import { Badge } from "#/components/ui/badge";

/** Heading content that keeps the catalog name and saved ticker separate. */
export function VoucherTitleLabel({
  name,
  displaySymbol,
}: {
  name: string;
  displaySymbol?: string | null;
}) {
  return (
    <>
      <span dir="auto">{name}</span>
      {displaySymbol ? (
        <>
          {" "}
          <Badge dir="ltr" size="sm" variant="muted" className="whitespace-nowrap font-mono">
            {displaySymbol}
          </Badge>
        </>
      ) : null}
    </>
  );
}
