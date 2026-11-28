import { Badge } from "#/components/ui/badge";

/** Heading content that keeps the catalog name and current ticker separate. */
export function VoucherTitleLabel({ name, ticker }: { name: string; ticker?: string | null }) {
  return (
    <>
      <span dir="auto">{name}</span>
      {ticker ? (
        <>
          {" "}
          <Badge dir="ltr" size="sm" variant="muted" className="whitespace-nowrap font-mono">
            {ticker}
          </Badge>
        </>
      ) : null}
    </>
  );
}
