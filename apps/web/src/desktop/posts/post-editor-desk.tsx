import { useLingui } from "@lingui/react/macro";
import { useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { DeskCanvas } from "#/desktop/ui/page";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";
import { cn } from "#/lib/utils";

type EditorProps = { mode: "new" } | { mode: "edit"; reportId: string };

/**
 * The phone editor in a 680px column, with an outline beside it that opens
 * and scrolls to each optional group. The form, its draft, validation and
 * submit are the phone's; this only lays them out.
 */
export function PostEditorDesk(props: EditorProps) {
  const { t } = useLingui();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const voucher = props.mode === "new" ? seedVoucher(search) : null;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const outline = [t`Post`, t`Event details`, t`Place`, t`Tags and resources`, t`Photos`, t`Links`];

  const jumpTo = (index: number) => {
    setActive(index);
    const root = editorRef.current;
    if (!root) return;
    if (index === 0) {
      root.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const group = [...root.querySelectorAll("details")].find(
      (details) => details.querySelector("summary")?.textContent?.trim() === outline[index],
    );
    if (!group) return;
    group.open = true;
    group.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <DeskCanvas width="read" className="grid-cols-[200px_minmax(0,680px)] gap-8">
      <nav aria-label={t`Post`} className="sticky top-0 grid content-start gap-0.5 self-start">
        {outline.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-current={active === index ? "true" : undefined}
            onClick={() => jumpTo(index)}
            className={cn(
              "flex h-[34px] items-center px-3 text-start text-xs font-medium text-muted-foreground hover:text-foreground",
              active === index &&
                "bg-accent font-semibold text-foreground shadow-[inset_2px_0_0_var(--color-primary)]",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        ref={editorRef}
        className={cn(
          "min-w-0 scroll-mt-7",
          // The phone's back link: the desktop crumbs replace it.
          "[&>div>:first-child]:hidden [&>div]:space-y-5",
          // The restored-draft notice reads as a callout, Start over at its end.
          "[&>div>div:has(>button)]:flex [&>div>div:has(>button)]:items-center",
          "[&>div>div:has(>button)]:gap-3 [&>div>div:has(>button)]:space-y-0",
          "[&>div>div:has(>button)]:border-s-[3px] [&>div>div:has(>button)]:border-s-primary",
          "[&>div>div:has(>button)]:px-4 [&>div>div:has(>button)>button]:ms-auto",
          // Optional groups are plain 44px rows, not boxes inside the page.
          "[&_form>details]:scroll-mt-7 [&_form>details]:border-0 [&_form>details]:border-t",
          "[&_form>details]:border-border [&_form>details]:bg-transparent [&_form>details]:p-0",
          "[&_form>details:last-of-type]:border-b [&_form>details[open]]:pb-4",
          "[&_form>details>summary]:flex [&_form>details>summary]:h-11",
          "[&_form>details>summary]:items-center [&_form>details>summary]:font-semibold",
          "[&_form>details>summary+div]:mt-1",
          "[&_form>details:not(:last-of-type)]:mb-0",
          "[&_form>button[type=submit]]:w-auto [&_form>button[type=submit]]:px-6",
        )}
      >
        {props.mode === "edit" ? (
          <PostEditorPage mode="edit" reportId={props.reportId} />
        ) : (
          <PostEditorPage mode="create" voucher={voucher} />
        )}
      </div>
    </DeskCanvas>
  );
}

function seedVoucher(search: Record<string, unknown>) {
  const voucher = search.voucher;
  const chainRaw = search.chainId;
  const chainId = typeof chainRaw === "number" ? chainRaw : Number(chainRaw);
  if (typeof voucher !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(voucher)) return null;
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  return {
    chainId,
    address: voucher,
    name: typeof search.voucherName === "string" ? search.voucherName : undefined,
  };
}
