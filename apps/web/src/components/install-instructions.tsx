import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";

export function InstallInstructions() {
  const [platform, setPlatform] = useState<"unknown" | "apple" | "android" | "other">("unknown");
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const apple =
      /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    setPlatform(apple ? "apple" : /Android/i.test(ua) ? "android" : "other");
    setEmbedded(/FBAN|FBAV|Instagram|\bLine\/|; wv\)/i.test(ua));
  }, []);

  return (
    <div className="space-y-3 text-sm">
      {embedded ? (
        <p>
          <Trans>
            Open this link in your phone's browser first. Use Chrome on Android or Safari on iPhone.
          </Trans>
        </p>
      ) : null}
      {platform === "apple" ? (
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <Trans>Open this page in Safari or Chrome and tap Share.</Trans>
          </li>
          <li>
            <Trans>Choose Add to Home Screen.</Trans>
          </li>
          <li>
            <Trans>If shown, keep Open as Web App switched on, then tap Add.</Trans>
          </li>
        </ol>
      ) : platform === "android" ? (
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <Trans>Open this page in Chrome.</Trans>
          </li>
          <li>
            <Trans>Tap the three-dot menu, then Add to home screen or Install app.</Trans>
          </li>
          <li>
            <Trans>Confirm Install or Add when asked.</Trans>
          </li>
        </ol>
      ) : (
        <p>
          <Trans>
            Look for Install app in your browser's menu. On a Mac with Safari, choose File, then Add
            to Dock.
          </Trans>
        </p>
      )}
    </div>
  );
}
