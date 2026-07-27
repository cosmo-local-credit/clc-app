import { useState, type ComponentProps } from "react";

import { cn } from "#/lib/utils";
import { Skeleton } from "./skeleton";

type ProgressiveImageProps = ComponentProps<"img"> & {
  skeletonClassName?: string;
};

/**
 * Keeps progressively decoded network images hidden until the complete image is
 * ready, then cross-fades it over the shadcn skeleton occupying the same box.
 * The parent must establish the image dimensions and `position: relative`.
 */
export function ProgressiveImage({
  className,
  decoding = "async",
  onError,
  onLoad,
  skeletonClassName,
  src,
  ...props
}: ProgressiveImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = typeof src === "string" && loadedSrc === src;

  return (
    <>
      {loaded ? null : (
        <Skeleton
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-none motion-reduce:animate-none",
            skeletonClassName,
          )}
        />
      )}
      <img
        {...props}
        src={src}
        decoding={decoding}
        data-state={loaded ? "loaded" : "loading"}
        className={cn(
          "opacity-0 transition-opacity duration-300 motion-reduce:transition-none",
          loaded && "opacity-100",
          className,
        )}
        onLoad={(event) => {
          onLoad?.(event);
          const image = event.currentTarget;
          const reveal = () => setLoadedSrc(typeof src === "string" ? src : null);
          if (typeof image.decode === "function") {
            void image.decode().then(reveal, reveal);
            return;
          }
          reveal();
        }}
        onError={onError}
      />
    </>
  );
}
