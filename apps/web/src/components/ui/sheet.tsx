import { Dialog } from "@base-ui/react/dialog";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

// ── Convenience re-exports ─────────────────────────────────────────────────────
export const SheetRoot = Dialog.Root;
export const SheetPortal = Dialog.Portal;
export const SheetClose = Dialog.Close;
export const SheetTitle = Dialog.Title;

// ── Backdrop ───────────────────────────────────────────────────────────────────

function SheetBackdrop({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<Dialog.Backdrop
			className={cn(
				"fixed inset-0 min-h-dvh bg-black/50 transition-opacity duration-200",
				"data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
				// iOS scroll bounce
				"supports-[-webkit-touch-callout:none]:absolute",
				className,
			)}
			{...props}
		/>
	);
}

// ── Popup (slides up from bottom) ─────────────────────────────────────────────

function SheetContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof Dialog.Popup>) {
	return (
		<Dialog.Popup
			className={cn(
				// Position
				"fixed inset-x-0 bottom-0 z-50",
				// Shape
				"flex max-h-[85dvh] flex-col rounded-t-2xl bg-background",
				// Shadow
				"shadow-xl",
				// Animation
				"transition-transform duration-200 ease-out",
				"data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
				className,
			)}
			{...props}
		>
			{/* Drag indicator */}
			<div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
			{children}
		</Dialog.Popup>
	);
}

// ── Header / footer helpers ───────────────────────────────────────────────────

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-1.5 px-4 pb-3 pt-4", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2 px-4 pb-6 pt-2", className)}
			{...props}
		/>
	);
}

export { SheetBackdrop, SheetContent, SheetFooter, SheetHeader };
