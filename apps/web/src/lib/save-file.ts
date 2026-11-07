/**
 * Whether the app is running as an installed iOS PWA, where download anchors
 * are silently ignored. Saving there goes through the share sheet (Save Image,
 * Save to Files) or a long-press on a rendered image instead.
 */
export function isIosInstalledApp(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Starts a browser download of `file` under its own name: the Downloads folder
 * on Android, Files on iOS Safari. Does nothing useful in an installed iOS app;
 * check `isIosInstalledApp` first.
 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking at once can cancel the download before the browser reads the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
