import { getLocaleDirection, isSupportedLocale } from "@clc/i18n/index";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { receivePayLink, receivePosterIdentity } from "#/features/wallet/logic/receive-poster";
import {
  RECEIVE_POSTER_HEIGHT,
  RECEIVE_POSTER_WIDTH,
  type ReceivePosterContent,
  renderReceivePoster,
} from "#/features/wallet/ui/receive-poster";
import { BRAND_APP_NAME, BRAND_THEME_COLOR } from "#/lib/brand";
import { CHAIN_INFO } from "#/lib/chain";
import { downloadFile } from "#/lib/save-file";

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

/**
 * The receive QR as a poster to save, print for a counter, or send in a chat.
 *
 * The drawing is the phone's (`renderReceivePoster`), so both views produce the
 * same picture; only the surface differs — a dialog here, a sheet there. The
 * poster is rendered when the dialog opens rather than on the click, because
 * `navigator.share` is refused once an await has outlived the gesture that
 * asked for it. Saving is a plain download: the iOS installed-app path the
 * phone needs cannot arise on a fine pointer at 1024px.
 */
export function ReceivePosterDialog({
  open,
  onClose,
  address,
  qrValue,
  name,
  username,
}: {
  open: boolean;
  onClose: () => void;
  address: `0x${string}`;
  qrValue: string;
  name: string | null;
  username: string | null;
}) {
  const { t, i18n } = useLingui();
  const profile = useAuthProfile({ enabled: open });
  // Wait for the photo before drawing, or the poster renders twice and the
  // preview swaps while it is being looked at.
  const profileSettled = profile.fetchStatus !== "fetching";
  const displayName = name?.trim() || profile.data?.name?.trim() || null;
  const avatarUrl = profile.data?.avatarUrl || null;
  const chainName = CHAIN_INFO.name;
  const direction = isSupportedLocale(i18n.locale) ? getLocaleDirection(i18n.locale) : "ltr";

  const content = useMemo<ReceivePosterContent>(
    () => ({
      qrValue,
      identity: receivePosterIdentity({ name: displayName, username, address }),
      name: displayName,
      avatarUrl,
      brandName: BRAND_APP_NAME,
      brandColor: BRAND_THEME_COLOR.light,
      headline: t`Scan to pay me`,
      footer: t`Open Send in CLC and scan`,
      network: t`${chainName} network only`,
      direction,
    }),
    [qrValue, displayName, username, address, avatarUrl, chainName, direction, t],
  );

  const poster = useQuery({
    queryKey: ["receive-poster", content],
    queryFn: ({ signal }) => renderReceivePoster(content, signal),
    enabled: open && profileSettled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const file = useMemo(
    () =>
      poster.data
        ? new File([poster.data], `clc-receive-${address.slice(2, 10)}.png`, { type: "image/png" })
        : null,
    [poster.data, address],
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!poster.data) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(poster.data);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [poster.data]);

  // After a failed share the next click copies instead: a browser only writes
  // to the clipboard inside a fresh gesture, so copying from the catch fails.
  const [copyOnly, setCopyOnly] = useState(false);
  useEffect(() => {
    if (!open) setCopyOnly(false);
  }, [open]);

  const shareText = () =>
    [
      t`Pay me on CLC`,
      displayName ?? username,
      address,
      receivePayLink(window.location.origin, address),
    ]
      .filter(Boolean)
      .join("\n");

  const copyText = () => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy link`);
      return;
    }
    void navigator.clipboard
      .writeText(shareText())
      .then(() => toast.success(t`Link copied`))
      .catch(() => toast.error(t`Couldn't copy link`));
  };

  const share = async () => {
    if (!navigator.share) {
      copyText();
      return;
    }
    const text = shareText();
    // The link rides in `text`, not `url`: anything that takes an image and a
    // caption drops `url`, and so does the copy fallback.
    const data: ShareData =
      file && navigator.canShare?.({ files: [file], text })
        ? { files: [file], text }
        : { title: t`My wallet address`, text };
    try {
      await navigator.share(data);
    } catch (error) {
      if (!isAbort(error)) setCopyOnly(true);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="grid w-96 max-w-[calc(100vw-3rem)] gap-4 rounded-none bg-card p-5 shadow-none">
          <DialogTitle>
            <Trans>Payment QR code</Trans>
          </DialogTitle>
          {previewUrl ? (
            // biome-ignore lint/performance/noImgElement: a generated PNG, saved by download or a right-click
            <img
              src={previewUrl}
              alt={t`Payment QR code`}
              width={RECEIVE_POSTER_WIDTH}
              height={RECEIVE_POSTER_HEIGHT}
              className="aspect-[3/4] h-auto w-full border border-border"
            />
          ) : poster.isError ? (
            <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 border border-border p-4 text-center">
              <p className="text-destructive text-xs">
                <Trans>Couldn't create the image.</Trans>
              </p>
              <Button variant="outline" onClick={() => void poster.refetch()}>
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : (
            <div aria-busy="true" className="aspect-[3/4] w-full animate-pulse bg-muted" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!file} onClick={() => file && downloadFile(file)}>
              <FiDownload className="size-4" aria-hidden="true" />
              <Trans>Save</Trans>
            </Button>
            {/* Without an image, Share still sends the address and link. */}
            <Button
              disabled={!file && !poster.isError}
              onClick={() => {
                if (copyOnly) copyText();
                else void share();
              }}
            >
              {copyOnly ? (
                <RiFileCopyLine className="size-4" aria-hidden="true" />
              ) : (
                <RiShareLine className="size-4" aria-hidden="true" />
              )}
              {copyOnly ? <Trans>Copy link</Trans> : <Trans>Share</Trans>}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
