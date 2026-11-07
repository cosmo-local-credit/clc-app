import { getLocaleDirection, isSupportedLocale } from "@clc/i18n/index";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { receivePayLink, receivePosterIdentity } from "#/features/wallet/logic/receive-poster";
import { BRAND_APP_NAME, BRAND_THEME_COLOR } from "#/lib/brand";
import { CHAIN_INFO } from "#/lib/chain";
import { downloadFile, isIosInstalledApp } from "#/lib/save-file";
import {
  RECEIVE_POSTER_HEIGHT,
  RECEIVE_POSTER_WIDTH,
  type ReceivePosterContent,
  renderReceivePoster,
} from "./receive-poster";

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

/**
 * The receive QR as a poster to save or send, previewed before either.
 *
 * The poster is rendered when the sheet opens, not on the tap: iOS and Android
 * both refuse `navigator.share` once an await has outlived the tap that asked
 * for it, so the file has to exist before the button is pressed. The preview is
 * the PNG itself, so a long-press on it saves to Photos on iOS too.
 */
export function ReceivePosterSheet({
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
  // preview swaps under the member's thumb.
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

  // After a failed share, the next tap copies instead. WebKit only writes to
  // the clipboard inside a fresh tap, so copying from the catch would fail.
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
    // The link rides in `text`, not `url`: messengers that take an image and a
    // caption drop `url`, and so does the copy fallback.
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

  const save = async () => {
    if (!file) return;
    if (!isIosInstalledApp()) {
      downloadFile(file);
      return;
    }
    // An installed iOS app ignores download anchors. Its share sheet leads
    // with Save Image, which files the poster in Photos.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (error) {
        if (isAbort(error)) return;
      }
    }
    toast(t`Press and hold the image to save it.`);
  };

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  <Trans>Payment QR code</Trans>
                </SheetTitle>
              </SheetHeader>

              <div className="flex min-h-0 justify-center overflow-y-auto px-4 pb-2">
                {/* 39dvh wide is 52dvh tall at 3:4: the whole poster fits the
                    sheet on a 640px-tall phone without scrolling. */}
                {previewUrl ? (
                  // biome-ignore lint/performance/noImgElement: a generated PNG the member can long-press to save
                  <img
                    src={previewUrl}
                    alt={t`Payment QR code`}
                    width={RECEIVE_POSTER_WIDTH}
                    height={RECEIVE_POSTER_HEIGHT}
                    className="aspect-[3/4] h-auto w-[min(100%,39dvh)] border border-border"
                  />
                ) : poster.isError ? (
                  <div className="flex aspect-[3/4] w-[min(100%,39dvh)] flex-col items-center justify-center gap-3 border border-border bg-card p-4 text-center">
                    <p className="text-destructive text-xs">
                      <Trans>Couldn't create the image.</Trans>
                    </p>
                    <Button variant="outline" tap onClick={() => void poster.refetch()}>
                      <Trans>Try again</Trans>
                    </Button>
                  </div>
                ) : (
                  <div
                    aria-busy="true"
                    className="aspect-[3/4] w-[min(100%,39dvh)] animate-pulse bg-muted"
                  />
                )}
              </div>

              <SheetFooter className="grid grid-cols-2">
                <Button variant="outline" tap disabled={!file} onClick={() => void save()}>
                  <FiDownload className="size-4" aria-hidden="true" />
                  <Trans>Save</Trans>
                </Button>
                {/* Without an image, Share still sends the address and link. */}
                <Button
                  tap
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
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
