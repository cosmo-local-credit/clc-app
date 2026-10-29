import { useSyncExternalStore } from "react";

/** A fine pointer at 1024px or wider. Tablets with a coarse pointer stay on mobile. */
export const DESKTOP_MEDIA = "(min-width: 1024px) and (pointer: fine)";

export type AppLayout = "mobile" | "desktop";

export const layoutBootstrapScript =
  `(function(){try{` +
  `var d=matchMedia(${JSON.stringify(DESKTOP_MEDIA)}).matches?"desktop":"mobile";` +
  `document.documentElement.setAttribute("data-layout",d)` +
  `}catch(e){}})();`;

export function readLayout(): AppLayout {
  if (typeof document === "undefined") return "mobile";
  return document.documentElement.dataset.layout === "desktop" ? "desktop" : "mobile";
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  let media: MediaQueryList;
  try {
    media = window.matchMedia(DESKTOP_MEDIA);
  } catch {
    return () => {};
  }
  const apply = () => {
    const next: AppLayout = media.matches ? "desktop" : "mobile";
    const root = document.documentElement;
    if (root.dataset.layout === next) return;
    // Written BEFORE React is told, on purpose: `lib/view-drafts` reads this
    // attribute to tell a layout switch (the old view unmounts with the
    // attribute already naming the new layout) from a navigation (it does not).
    // `-view-draft-switch.test.tsx` holds this order in place.
    root.dataset.layout = next;
    onStoreChange();
  };
  apply();
  media.addEventListener?.("change", apply);
  return () => media.removeEventListener?.("change", apply);
}

/**
 * Server and the hydration render are mobile. The bootstrap attribute and this
 * subscription swap a wide, fine-pointer viewport once after hydration.
 */
export function useLayout(): AppLayout {
  return useSyncExternalStore(subscribe, readLayout, () => "mobile");
}
