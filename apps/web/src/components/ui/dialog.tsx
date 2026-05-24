import { Dialog } from "@base-ui/react/dialog";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

// ── Convenience re-exports ─────────────────────────────────────────────────────
export const DialogRoot = Dialog.Root;
export const DialogPortal = Dialog.Portal;
export const DialogTitle = Dialog.Title;

// ── Backdrop ───────────────────────────────────────────────────────────────────

function DialogBackdrop({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<Dialog.Backdrop
			className={cn(
				"fixed inset-0 min-h-dvh bg-black/50 transition-opacity duration-150",
				"data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
				"supports-[-webkit-touch-callout:none]:absolute",
				className,
			)}
			{...props}
		/>
	);
}

// ── Popup (centered, scales in) ───────────────────────────────────────────────

function DialogContent({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<Dialog.Popup
			className={cn(
				// Position: centered
				"fixed left-1/2 top-1/2 z-50 w-[calc(100vw-3rem)] max-w-sm",
				"-translate-x-1/2 -translate-y-1/2",
				// Shape
				"rounded-xl bg-background p-6",
				"border border-border shadow-xl",
				// Animation
				"transition-all duration-150",
				"data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
				"data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
				className,
			)}
			{...props}
		>
			{children}
		</Dialog.Popup>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-1.5 pb-4", className)} {...props} />
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-2 pt-4", className)} {...props} />
	);
}

export { DialogBackdrop, DialogContent, DialogFooter, DialogHeader };
