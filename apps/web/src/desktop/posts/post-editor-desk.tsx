import { useSearch } from "@tanstack/react-router";

import { DeskCanvas } from "#/desktop/ui/page";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";

type EditorProps = { mode: "new" } | { mode: "edit"; reportId: string };

export function PostEditorDesk(props: EditorProps) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const voucher = props.mode === "new" ? seedVoucher(search) : null;

  return (
    <DeskCanvas width="read">
      <div className="[&>div>:first-child]:hidden">
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
