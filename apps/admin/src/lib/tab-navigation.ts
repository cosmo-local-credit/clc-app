/**
 * A click a record tab must not swallow.
 *
 * Every detail screen renders its tabs as real `<Link>`s so the open tab lives in
 * the URL, and lets Base UI's `onValueChange` do the navigation — one navigation,
 * one history entry, whether the tab was activated by click, Enter or Space. A
 * plain click therefore calls `preventDefault`, and a modified one must not: that
 * is what makes "open this tab in a new window" work, and the reason the tabs are
 * anchors at all.
 *
 * Structurally typed rather than taking React's `MouseEvent`, so the same
 * predicate serves an anchor's handler and a bare modifier check.
 */
export function isModifiedClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
