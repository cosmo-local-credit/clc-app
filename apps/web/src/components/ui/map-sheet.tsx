import { Drawer } from "@base-ui/react/drawer";
import { useLingui } from "@lingui/react/macro";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "#/lib/utils";

/**
 * A bottom sheet over a live map, after the Google Maps place sheet: it opens
 * small, shows more each time it is pulled up, and closes when pulled below its
 * smallest size.
 *
 * Non-modal over a map, on purpose. The map stays pannable above the sheet, and
 * a tap on the map is the map's event: the screen decides what it means, so the
 * sheet never closes itself on an outside press. Off a map, `modal` gives it a
 * backdrop and closes it on a tap outside, like the app's other sheets.
 */
export type MapSheetSnap = "peek" | "half" | "full";

const HALF = 0.55;
const FULL = 1;
const SNAP_ORDER: readonly MapSheetSnap[] = ["peek", "half", "full"];
/** Until the peek block has been laid out. */
const PEEK_FALLBACK_PX = 160;

type Layout = { viewport: number; popup: number; peek: number; floating: number };

const PeekContext = createContext<((element: HTMLElement | null) => void) | null>(null);

export const MapSheetTitle = Drawer.Title;
export const MapSheetDescription = Drawer.Description;

/**
 * The essentials at the top of the sheet. The smallest snap point is measured
 * from it, so it should keep a stable height as its content changes: truncate
 * rather than wrap.
 */
export function MapSheetPeek({ className, children }: { className?: string; children: ReactNode }) {
  const register = useContext(PeekContext);
  return (
    <div ref={register} className={className}>
      {children}
    </div>
  );
}

export function MapSheet({
  open,
  modal = false,
  snap,
  onSnapChange,
  onClose,
  onCoveredHeightChange,
  floating,
  children,
}: {
  open: boolean;
  /**
   * Off a map the sheet behaves like the app's other sheets: a backdrop dims
   * the screen and a tap outside closes it. Over a map, a tap on the map is
   * the map's event and the screen decides what it means.
   */
  modal?: boolean;
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  /**
   * Escape, a swipe below the peek, Android Back and any close button inside.
   * The sheet starts closing at once rather than waiting for `open` to follow,
   * because the caller may close it by navigating, and a swipe that waited
   * would bounce back to the peek first.
   */
  onClose: () => void;
  /**
   * Pixels from the bottom of the viewport to the top of whatever the sheet
   * draws over the map, the floating controls included. Reported whenever the
   * snap point or the layout changes.
   */
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
  /** Rides just above the sheet's top edge, and fades out above half. */
  floating?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const [closing, setClosing] = useState(false);
  if (closing && !open) setClosing(false);
  // A drawer that mounts already open skips its enter animation, and paints
  // once fully open before its snap point resolves. Opening it after mount
  // lets the first card on a screen, and a deep link's, rise from the bottom
  // like every later one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isOpen = open && !closing && mounted;

  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [peek, setPeek] = useState<HTMLElement | null>(null);
  const [safeArea, setSafeArea] = useState<HTMLDivElement | null>(null);
  const [floatingSlot, setFloatingSlot] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({ viewport: 0, popup: 0, peek: 0, floating: 0 });

  // Collapsing from full would otherwise leave the content scrolled, with the
  // peek block out of sight under a sheet that no longer scrolls. A layout
  // effect, so the content is back at the top before anything is painted.
  useLayoutEffect(() => {
    if (snap !== "full" && content) content.scrollTop = 0;
  }, [content, snap]);

  useLayoutEffect(() => {
    if (!popup) return;
    function measure() {
      if (!popup) return;
      setLayout((previous) => {
        const next: Layout = {
          viewport: viewport?.offsetHeight ?? 0,
          popup: popup.offsetHeight,
          // The scroll offset is added back: content scrolled at full, or out
          // of sight below it (by focus, say), leaves the block's height
          // unchanged and so no resize to measure again on.
          peek: !peek
            ? previous.peek
            : Math.round(
                peek.getBoundingClientRect().bottom -
                  popup.getBoundingClientRect().top +
                  (content?.scrollTop ?? 0) +
                  (safeArea?.offsetHeight ?? 0),
              ),
          floating: floatingSlot?.offsetHeight ?? 0,
        };
        return next.viewport === previous.viewport &&
          next.popup === previous.popup &&
          next.peek === previous.peek &&
          next.floating === previous.floating
          ? previous
          : next;
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [viewport, popup, peek, floatingSlot]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [viewport, popup, content, peek, safeArea, floatingSlot, snap]);

  const peekHeight = layout.peek > 0 ? layout.peek : PEEK_FALLBACK_PX;
  const peekPoint = `${peekHeight}px`;
  const snapPoints = useMemo(() => [peekPoint, HALF, FULL], [peekPoint]);
  const snapPoint = snap === "full" ? FULL : snap === "half" ? HALF : peekPoint;

  // The same resolution Base UI applies: fractions of the viewport, clamped to
  // the popup, which stops short of the status bar.
  const viewportHeight = layout.viewport || window.innerHeight;
  const maxHeight = Math.min(layout.popup || viewportHeight, viewportHeight);
  const sheetHeight =
    snap === "full"
      ? maxHeight
      : Math.min(maxHeight, snap === "half" ? HALF * viewportHeight : peekHeight);
  const coveredHeight = Math.round(sheetHeight + (snap === "full" ? 0 : layout.floating));

  const reportCoveredHeight = useEffectEvent((height: number, at: MapSheetSnap) => {
    onCoveredHeightChange?.(height, at);
  });
  useEffect(() => {
    if (isOpen) reportCoveredHeight(coveredHeight, snap);
  }, [isOpen, coveredHeight, snap]);

  const nextSnap = SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length] ?? "peek";

  // Set while a swipe that would have closed the sheet from above the peek is
  // turned into a collapse. Base UI then restores the snap point the swipe
  // started from, which must not override the peek.
  const collapsingRef = useRef(false);

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(next, details) => {
        if (next) return;
        // Only the peek swipes away. From half or full, a fling down or a drag
        // past the peek lands on the peek, as on the place sheet.
        if (details.reason === "swipe" && snap !== "peek") {
          details.cancel();
          collapsingRef.current = true;
          requestAnimationFrame(() => {
            collapsingRef.current = false;
          });
          onSnapChange("peek");
          return;
        }
        setClosing(true);
        onClose();
      }}
      modal={modal}
      disablePointerDismissal={!modal}
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      onSnapPointChange={(value) => {
        // Null is the swipe that closes the sheet; onOpenChange reports that.
        if (value === null || collapsingRef.current) return;
        onSnapChange(value === FULL ? "full" : value === HALF ? "half" : "peek");
      }}
    >
      <Drawer.Portal>
        {modal ? (
          <Drawer.Backdrop
            data-map-sheet-backdrop=""
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          />
        ) : null}
        {/* The viewport covers the screen but takes no input, or the map
            under it could not be panned. Only the popup does. */}
        <Drawer.Viewport ref={setViewport} className="pointer-events-none fixed inset-0 z-40">
          <Drawer.Popup
            ref={setPopup}
            className={cn(
              "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[calc(100%-env(safe-area-inset-top))] flex-col border-border border-t bg-card text-foreground outline-none",
              "will-change-transform [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))]",
              "transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-[ending-style]:duration-[calc(var(--drawer-swipe-strength)*450ms)] data-[swiping]:duration-0 motion-reduce:duration-0",
              "data-[ending-style]:[transform:translateY(100%)] data-[starting-style]:[transform:translateY(100%)]",
            )}
          >
            {floating ? (
              <div
                ref={setFloatingSlot}
                data-base-ui-swipe-ignore=""
                className={cn(
                  "pointer-events-none absolute end-0 bottom-full pe-4 pb-3 transition-opacity duration-200 [&>*]:pointer-events-auto",
                  snap === "full" && "opacity-0 [&>*]:pointer-events-none",
                )}
              >
                {floating}
              </div>
            ) : null}
            <div
              ref={setSafeArea}
              aria-hidden="true"
              className="invisible absolute h-[env(safe-area-inset-bottom)] w-px"
            />

            <button
              type="button"
              aria-label={snap === "full" ? t`Collapse` : t`Expand`}
              className="flex h-11 w-full shrink-0 cursor-ns-resize touch-none select-none items-center justify-center"
              onClick={() => onSnapChange(nextSnap)}
            >
              <span aria-hidden="true" className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </button>

            <PeekContext.Provider value={setPeek}>
              <Drawer.Content
                ref={setContent}
                className={cn(
                  "min-h-0 flex-1 overscroll-contain pb-[env(safe-area-inset-bottom)]",
                  snap === "full" ? "overflow-y-auto" : "overflow-hidden",
                )}
              >
                {children}
              </Drawer.Content>
            </PeekContext.Provider>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
