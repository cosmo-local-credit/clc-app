export type MapsTarget = {
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type MapsEnvironment = {
  userAgent: string;
  navigate: (url: string) => void;
};

/** Opens a location in the platform's default maps handler when one is available. */
export function openDefaultMaps(target: MapsTarget, environment?: MapsEnvironment): boolean {
  const label = target.label?.trim() || null;
  const hasCoordinates = typeof target.lat === "number" && typeof target.lng === "number";
  if (!label && !hasCoordinates) return false;

  const runtime = environment ?? {
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    navigate: (url: string) => window.location.assign(url),
  };
  const isApple = /\b(?:iPad|iPhone|iPod|Macintosh|Mac OS X)\b/i.test(runtime.userAgent);
  const isAndroid = /Android/i.test(runtime.userAgent);
  const coordinates = hasCoordinates ? `${target.lat},${target.lng}` : null;
  let url: string;

  if (isApple) {
    const search = new URLSearchParams();
    if (coordinates) search.set("ll", coordinates);
    search.set("q", label ?? coordinates ?? "");
    url = `https://maps.apple.com/?${search.toString()}`;
  } else if (isAndroid) {
    const query = coordinates && label ? `${coordinates}(${label})` : (label ?? coordinates ?? "");
    url = `geo:${coordinates ?? "0,0"}?q=${encodeURIComponent(query)}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label ?? coordinates ?? "")}`;
  }

  runtime.navigate(url);
  return true;
}
