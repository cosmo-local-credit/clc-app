import { uploadInOrder } from "@clc/api/features/images/batch";
import { checkImageFile } from "@clc/api/features/images/policy";
import {
  REPORT_IMAGE_CAPTION_MAX,
  formatByteSize,
  type ReportImageWrite,
} from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { FaCamera, FaChevronDown, FaChevronUp, FaTrash } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { useImageUpload } from "#/features/images/use-image-upload";

/**
 * A post's gallery, on top of the existing `report.image` upload transport.
 *
 * `ImageUploadField` beside it holds one URL and is right for a single photo;
 * a post holds up to 50 in document order, with captions. Its first photo is
 * always the cover, so the author never has to make that extra choice. So
 * this is new UI over the same `useImageUpload` mutation and `uploadInOrder`
 * fan-out — not a new upload path.
 *
 * Storage reports the intrinsic size of what it stored, which is persisted as
 * `maxWidth`/`maxHeight`; the display box stays null, as everything this app
 * uploads does. Only the old editor's rows carry one.
 */
export function PostImageManager({
  images,
  coverUrl,
  onChange,
  onCoverChange,
  onBusyChange,
  disabled,
  max,
}: {
  images: ReportImageWrite[];
  /** The post's `imageUrl`. A cover is a copy of a gallery URL, not a removal. */
  coverUrl: string | null;
  onChange: (images: ReportImageWrite[]) => void;
  onCoverChange: (url: string | null) => void;
  /** Save must be disabled while bytes are in flight, or it saves the old list. */
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  max: number;
}) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useImageUpload();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const remaining = max - images.length;
  const busy = uploading > 0;

  async function addFiles(files: File[]) {
    const accepted: File[] = [];
    let rejected = false;
    for (const file of files.slice(0, Math.max(0, remaining))) {
      if (checkImageFile(file).ok) accepted.push(file);
      else rejected = true;
    }

    setError(
      rejected ? t`Some files were skipped. Use JPEG, PNG or WebP images under 8 MB.` : null,
    );
    if (accepted.length === 0) return;

    setUploading(accepted.length);
    onBusyChange(true);
    try {
      // Bounded fan-out in document order: a phone must not open one request
      // per file, and the order the author chose is the order they are stored.
      const results = await uploadInOrder(accepted, (file) =>
        upload.mutateAsync({
          file,
          purpose: "report.image",
          uploadId: crypto.randomUUID().replaceAll("-", ""),
        }),
      );

      const added: ReportImageWrite[] = [];
      let failed = false;
      for (const result of results) {
        if (result.status !== "fulfilled") {
          failed = true;
          continue;
        }
        if (images.some((image) => image.url === result.value.url)) continue;
        added.push({
          url: result.value.url,
          // The editor's display box, which nothing here sets.
          width: null,
          height: null,
          maxWidth: result.value.width || null,
          maxHeight: result.value.height || null,
          byteSize: result.value.byteSize || null,
          caption: null,
        });
      }

      if (added.length > 0) {
        onChange([...images, ...added]);
        // The first image added to a new post is its cover. Existing posts
        // retain their saved cover; an imported post without one uses its
        // earliest gallery image as soon as the author adds another.
        if (!coverUrl) onCoverChange(images[0]?.url ?? added[0]!.url);
      }
      if (failed) setError(t`Some photos didn't upload. Try adding them again.`);
    } finally {
      setUploading(0);
      onBusyChange(false);
    }
  }

  function replaceAt(index: number, image: ReportImageWrite) {
    onChange(images.map((current, position) => (position === index ? image : current)));
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  }

  function remove(index: number) {
    const removed = images[index];
    onChange(images.filter((_, position) => position !== index));
    // The cover is a copy of a gallery URL, so keep it on an image that is
    // still present when its current row is removed.
    if (removed && coverUrl === removed.url) {
      onCoverChange(images.find((_, position) => position !== index)?.url ?? null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={t`Add photos`}
        disabled={disabled || busy}
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 bg-card"
          disabled={disabled || busy || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          <FaCamera aria-hidden className="me-2 size-4" />
          {busy ? <Trans>Uploading…</Trans> : <Trans>Add photos</Trans>}
        </Button>
        <p className="text-muted-foreground text-xs tabular-nums">
          <Trans>
            {images.length} of {max}
          </Trans>
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {images.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Photos appear in the order you add them.</Trans>
        </p>
      ) : (
        <ul className="space-y-3">
          {images.map((image, index) => {
            const isCover = coverUrl === image.url;
            const size = formatByteSize(image.byteSize);

            return (
              <li key={image.url} className="space-y-2 border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <span className="relative block size-16 shrink-0 overflow-hidden bg-muted">
                    <ProgressiveImage
                      src={image.url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      <Trans>Photo {index + 1}</Trans>
                      {size ? ` · ${size}` : null}
                    </p>
                    {isCover ? (
                      <p className="font-medium text-primary text-xs">
                        <Trans>Cover photo</Trans>
                      </p>
                    ) : null}
                  </div>
                </div>

                <Input
                  className="bg-card"
                  aria-label={t`Caption for photo ${index + 1}`}
                  placeholder={t`Caption (optional)`}
                  maxLength={REPORT_IMAGE_CAPTION_MAX}
                  value={image.caption ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    replaceAt(index, { ...image, caption: event.target.value || null })
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 bg-card"
                    disabled={disabled || index === 0}
                    aria-label={t`Move photo ${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    <FaChevronUp aria-hidden className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 bg-card"
                    disabled={disabled || index === images.length - 1}
                    aria-label={t`Move photo ${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    <FaChevronDown aria-hidden className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 bg-card text-destructive"
                    disabled={disabled}
                    aria-label={t`Remove photo ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <FaTrash aria-hidden className="size-3" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
