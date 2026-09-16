import { checkImageFile, IMAGE_POLICIES } from "@clc/api/features/images/policy";
import type { ImagePurpose } from "@clc/api/features/images/policy";
import { useEffect, useRef, useState } from "react";
import { HiOutlinePhotograph, HiOutlineTrash, HiOutlineUpload } from "react-icons/hi";

import { useImageUpload } from "#/features/images/use-image-upload";
import { ImageCropDialog } from "#/components/admin/image-crop-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";

/**
 * The console's image editor: pick a file, and the URL it becomes is the value.
 *
 * Uploading happens on selection rather than on save, which is what makes replace
 * work the same as first upload. Storage keys are content-addressed and the
 * service never deletes, so an image uploaded for a save the operator then
 * abandons costs one orphaned object — a far better trade than holding a File
 * across a form and re-deriving the upload on every submit attempt.
 *
 * The value is therefore always a stored URL, never a File, and the caller's save
 * carries a string it can send straight to clc-core. `null` means the operator
 * removed the image; the caller decides what that means on its endpoint, because
 * the two endpoints differ — the account profile has a `clearAvatar` flag and the
 * pool profile reads `""`.
 *
 * Shared by the account sheet, the pool and voucher publish forms, and the pool
 * record sheet.
 * Nothing here is per-resource: the purpose decides the folder and the width, and
 * the shared policy decides which files are worth sending at all.
 */
export function ImageUploadField({
  label,
  hint,
  purpose,
  value,
  onChange,
  onBusyChange,
  disabled,
  dense,
}: {
  label: string;
  hint?: string;
  purpose: ImagePurpose;
  /** The stored URL, or null when there is no image. */
  value: string | null;
  onChange: (url: string | null) => void;
  /**
   * Whether an upload or a framing step is in flight.
   *
   * The parent form needs this because selection and save are separate actions
   * here: the file uploads on selection, so a Save pressed while that is in
   * flight would persist the *previous* URL — the new one has not arrived at
   * `onChange` yet. Without this the race is invisible to the caller.
   */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /**
   * Fits the field into a panel whose height is already set by the fields beside
   * it: a smaller preview, icon-only controls, and the hint moved onto the
   * label's line. Same behaviour, roughly half the vertical space.
   */
  dense?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useImageUpload();
  const [rejection, setRejection] = useState<string | null>(null);
  /** Chosen, awaiting a frame. Purposes with no fixed shape skip this. */
  const [pending, setPending] = useState<File | null>(null);

  // The preview matches how the image is displayed rather than being chosen at
  // the call site: an account avatar, a voucher icon and a pool logo are all
  // rendered in an Avatar, so all three are previewed as circles. An offering
  // photograph is cropped to the same 1:1 but shown square, which is why the
  // shape is a property of the purpose and not derived from its aspect.
  const round = IMAGE_POLICIES[purpose].preview === "circle";
  const square = !round && IMAGE_POLICIES[purpose].aspect === 1;

  // The framing dialog counts as busy too: a file chosen and not yet cropped has
  // not produced a URL either.
  const inFlight = upload.isPending || pending !== null;
  const busy = inFlight || disabled;

  // Seeded false rather than from the first render: a field that mounts while an
  // upload is already in flight has to report it, and comparing against its own
  // initial value would treat that as "no change" and never tell the parent.
  const reportedBusy = useRef(false);
  useEffect(() => {
    if (reportedBusy.current === inFlight) return;
    reportedBusy.current = inFlight;
    onBusyChange?.(inFlight);
  }, [inFlight, onBusyChange]);
  const uploadLabel = upload.isPending ? "Uploading…" : value ? "Replace" : "Upload";
  const error = rejection ?? (upload.isError ? "Upload failed. Try again." : null);

  async function select(file: File | undefined) {
    if (!file) return;

    const check = checkImageFile(file);
    if (!check.ok) {
      setRejection(
        check.reason === "unsupported-type"
          ? "Choose a JPEG, PNG or WebP image."
          : "That image is too large. Choose one under 8 MB.",
      );
      return;
    }

    setRejection(null);
    upload.reset();

    // A purpose with a display shape is framed first, so what is stored is what
    // the console will render. One without — a post photograph — uploads as it is.
    if (IMAGE_POLICIES[purpose].aspect) {
      setPending(file);
      return;
    }

    await send(file);
  }

  /** Uploads the framed (or unframed) file and reports its stored URL. */
  async function send(file: File) {
    try {
      // A fresh id per attempt: the object key is derived from it, so reusing one
      // across two different files would be the only way to overwrite an object
      // this service treats as immutable.
      const uploaded = await upload.mutateAsync({
        file,
        purpose,
        uploadId: crypto.randomUUID().replaceAll("-", ""),
      });
      onChange(uploaded.url);
    } catch {
      // Reported through upload.isError above; the previous value stays.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Dense puts the hint on the label's line. Under the buttons it would be
          the second line of prose that pushes the panel taller than the column
          it sits next to, which is the whole thing this variant avoids. */}
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`${purpose}-file`}>{label}</Label>
        {dense && hint && !error ? (
          <span className="text-muted-foreground text-xs">{hint}</span>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        {/* A face goes through Avatar, which is where this console's circular
            shape and its load-failure fallback already live. A logo or a banner is
            a rectangle on a card, so it gets the same flat outlined box every
            other inset in the console uses. */}
        {round ? (
          <Avatar className={`border-border shrink-0 border ${dense ? "size-12" : "size-16"}`}>
            {value ? <AvatarImage src={value} alt="" /> : null}
            <AvatarFallback className="bg-background">
              <HiOutlinePhotograph aria-hidden className="text-muted-foreground size-5" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={`border-border bg-background flex shrink-0 items-center justify-center overflow-hidden border ${
              // The box matches the crop: a square photo in a 16:9 slot would be
              // letterboxed in the one place the operator is judging the framing.
              square ? (dense ? "size-12" : "size-16") : dense ? "h-12 w-20" : "h-16 w-28"
            }`}
          >
            {value ? (
              <img src={value} alt="" className="size-full object-cover" />
            ) : (
              <HiOutlinePhotograph aria-hidden className="text-muted-foreground size-5" />
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <input
            ref={inputRef}
            id={`${purpose}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              void select(event.target.files?.[0]);
              // Cleared so re-picking the same file still fires a change.
              event.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size={dense ? "icon-sm" : "sm"}
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              aria-label={dense ? uploadLabel : undefined}
              title={dense ? uploadLabel : undefined}
            >
              <HiOutlineUpload />
              {dense ? null : uploadLabel}
            </Button>

            {value ? (
              <Button
                type="button"
                size={dense ? "icon-sm" : "sm"}
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRejection(null);
                  upload.reset();
                  onChange(null);
                }}
                aria-label={dense ? "Remove" : undefined}
                title={dense ? "Remove" : undefined}
              >
                <HiOutlineTrash />
                {dense ? null : "Remove"}
              </Button>
            ) : null}
          </div>

          {hint && !error && !dense ? (
            <p className="text-muted-foreground text-xs">{hint}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <ImageCropDialog
        file={pending}
        purpose={purpose}
        onCancel={() => setPending(null)}
        onCropped={(cropped) => {
          setPending(null);
          void send(cropped);
        }}
      />
    </div>
  );
}
