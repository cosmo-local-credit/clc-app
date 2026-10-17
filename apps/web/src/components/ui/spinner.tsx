import { RiLoader4Line } from "react-icons/ri";

import { cn } from "#/lib/utils";

/**
 * The app's one loading indicator. It inherits the text colour of whatever it
 * sits in and is 16px unless a `size-*` class says otherwise. It is decorative:
 * the label beside it, or `aria-busy` on its host, is what a screen reader
 * hears. Under reduced motion it stops turning and stays as a static ring.
 *
 * Buttons get it through `pending` and settings rows through `busy`; use it
 * directly only for a loader that is not inside one of those.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <RiLoader4Line
      data-slot="spinner"
      aria-hidden="true"
      className={cn("size-4 shrink-0 animate-spin motion-reduce:animate-none", className)}
    />
  );
}
