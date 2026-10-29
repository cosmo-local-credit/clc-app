import { useLayoutEffect, useRef, useState } from "react";

/**
 * The width of one element, kept current. For a layout choice a container
 * query cannot make: which columns a table renders at all.
 *
 * `null` until measured (and in tests, which lay nothing out); callers treat
 * that as "room to spare" so the first paint is never the cramped one.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
