import { useLingui } from "@lingui/react/macro";
import { type ChangeEvent, useRef, useState } from "react";
import { FaCamera, FaImages } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";

type Props = {
  buttonLabel: string;
  inputLabel: string;
  onSelect: (file: File) => void;
  cameraFacing: "user" | "environment";
  disabled?: boolean;
  /** The chosen photo is uploading; the trigger shows the Spinner. */
  pending?: boolean;
  required?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
};

/** One visible photo control, with explicit native camera and library paths. */
export function PhotoSourcePicker({
  buttonLabel,
  inputLabel,
  onSelect,
  cameraFacing,
  disabled,
  pending,
  required,
  ariaInvalid,
  ariaDescribedBy,
}: Props) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function selected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onSelect(file);
  }

  function openInput(input: HTMLInputElement | null) {
    setOpen(false);
    input?.click();
  }

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture={cameraFacing}
        className="hidden"
        aria-label={t`Take photo`}
        aria-required={required || undefined}
        onChange={selected}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={inputLabel}
        aria-required={required || undefined}
        onChange={selected}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        pending={pending}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        tap
      >
        <FaCamera aria-hidden className="me-2 size-4" />
        {buttonLabel}
      </Button>

      <SheetRoot open={open} onOpenChange={setOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="[&>div:first-child]:hidden">
            <SheetHeader className="px-6 pt-5 pb-3">
              <SheetTitle>{t`Choose a photo`}</SheetTitle>
            </SheetHeader>
            <div className="space-y-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => openInput(cameraInputRef.current)}
              >
                <FaCamera aria-hidden className="me-2 size-4" />
                {t`Take photo`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => openInput(libraryInputRef.current)}
              >
                <FaImages aria-hidden className="me-2 size-4" />
                {t`Choose from photos`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => setOpen(false)}
              >
                {t`Cancel`}
              </Button>
            </div>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
