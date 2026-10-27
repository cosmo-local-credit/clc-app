import { checkImageFile, IMAGE_POLICIES } from "@clc/api/features/images/policy";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

/**
 * Choosing a profile photo: the file check, the framing step, and the local
 * preview URL. Chooses only — it does not upload. The phone picker and the
 * desktop setup step draw the same state.
 */
export function useAvatarPicker({
  value,
  onChange,
  currentUrl,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  currentUrl?: string | null;
}) {
  const { t } = useLingui();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Chosen but not yet framed. Held here so the framing surface owns one job. */
  const [pending, setPending] = useState<File | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function select(file: File | undefined) {
    if (!file) return;

    const check = checkImageFile(file);
    if (!check.ok) {
      setError(
        check.reason === "unsupported-type"
          ? t`Choose a JPEG, PNG or WebP image.`
          : t`That image is too large. Choose one under 8 MB.`,
      );
      onChange(null);
      return;
    }

    setError(null);
    // A profile photo has a fixed display shape, so it is framed before it is
    // accepted — the picker never sets an unframed file.
    if (IMAGE_POLICIES["profile.avatar"].aspect) {
      setPending(file);
      return;
    }
    onChange(file);
  }

  return {
    shown: previewUrl ?? currentUrl ?? null,
    error,
    pending,
    select,
    remove: () => {
      setError(null);
      onChange(null);
    },
    cancelCrop: () => setPending(null),
    acceptCrop: (cropped: File) => {
      setPending(null);
      onChange(cropped);
    },
  };
}
