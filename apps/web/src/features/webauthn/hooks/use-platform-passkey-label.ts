import { useEffect, useState } from "react";

export type PasskeyProvider = "apple" | "google";

/**
 * True only on Chrome Android and mobile Apple devices (iOS/iPadOS).
 * These are the only platforms where stored platform passkeys reliably work.
 * All iOS browsers use the system WebAuthn implementation, so Chrome on iOS
 * must not be rejected by its CriOS user-agent marker. Desktop browsers,
 * Firefox Android, and Samsung Browser are excluded.
 */
export function isPasskeyPlatformAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iOS/iPadOS browsers all use Apple's system WebAuthn implementation.
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua);
  // Android Chrome — must have "Chrome/" but not "SamsungBrowser"
  const isAndroidChrome = /Android/.test(ua) && /Chrome\//.test(ua) && !/SamsungBrowser/.test(ua);
  return isAppleMobile || isAndroidChrome;
}

export function pickPasskeyProvider(): PasskeyProvider {
  if (typeof navigator === "undefined") return "google";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "apple";
  return "google";
}

export function usePlatformPasskeyLabel(): {
  available: boolean;
  provider: PasskeyProvider;
  label: string;
} {
  const [available, setAvailable] = useState(false);
  const [provider, setProvider] = useState<PasskeyProvider>("google");

  useEffect(() => {
    setAvailable(isPasskeyPlatformAvailable());
    setProvider(pickPasskeyProvider());
  }, []);

  return {
    available,
    provider,
    label: provider === "apple" ? "Apple ID" : "Google",
  };
}
