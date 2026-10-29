import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

import type { PaperWalletCustomization } from "#/features/onboarding/ui/paper-wallet-types";

const MAX_LOGO_BYTES = 512 * 1024; // 512 KB
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Editing the card's name, website, description and logo. The logo is read
 * into a data URL so the card can be exported without a network fetch.
 */
export function usePaperWalletCustomizer({
  value,
  onChange,
}: {
  value: PaperWalletCustomization;
  onChange: (next: PaperWalletCustomization) => void;
}) {
  const { t } = useLingui();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function setField(field: Exclude<keyof PaperWalletCustomization, "logoDataUrl">, next: string) {
    onChange({ ...value, [field]: next });
  }

  function handleLogoFile(target: HTMLInputElement) {
    const file = target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoError(t`SVG files are not supported. Use PNG, JPEG, or WebP.`);
      target.value = "";
      return;
    }

    // Validate size
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(t`File too large (${(file.size / 1024).toFixed(0)} KB). Maximum is 512 KB.`);
      target.value = "";
      return;
    }

    setLogoError(null);
    setLogoFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...value,
        logoDataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected
    target.value = "";
  }

  function resetLogo() {
    setLogoError(null);
    setLogoFileName(null);
    onChange({ ...value, logoDataUrl: null });
  }

  return { logoError, logoFileName, fileInputRef, setField, handleLogoFile, resetLogo };
}
