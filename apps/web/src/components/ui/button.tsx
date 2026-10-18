import { cva, type VariantProps } from "class-variance-authority";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils.ts";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-foreground/25 bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        info: "bg-info text-info-foreground [a]:hover:bg-info/80",
        success: "bg-success text-success-foreground [a]:hover:bg-success/80",
        offer: "bg-offer text-offer-foreground [a]:hover:bg-offer/80",
        voucher: "bg-voucher text-voucher-foreground [a]:hover:bg-voucher/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5",
        lg: "h-11 gap-2 px-4 text-sm has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3",
        icon: "size-9",
        "icon-lg": "size-11",
        // The Wallet's Send, Receive and Cash: the screen's three main doors,
        // an icon over an 11px label so a third of a 360px row fits every
        // catalog's word.
        tile: "h-14 flex-col gap-1 px-1 text-2xs",
      },
      // Pads a compact button's hit area out to 44px with an invisible
      // pseudo-element, so it meets the touch-target minimum without taking
      // 44px of layout. The 44px sizes already meet it and ignore the flag.
      tap: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        tap: true,
        size: "default",
        className:
          "relative before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
      },
      {
        tap: true,
        size: "icon",
        className: "relative before:absolute before:-inset-1 before:content-['']",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      tap: false,
    },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * The button is waiting on the network, the chain, an upload or a
     * signature. The Spinner takes the leading place, the button's own icons
     * hide, and it is disabled and `aria-busy` until the work settles. The
     * label stays the caller's: pass the pending wording ("Saving…") alongside.
     *
     * With `asChild` the child is usually a link, which `disabled` means
     * nothing to. It gets the Spinner ahead of its own content, `aria-busy`
     * and `aria-disabled`, drops pointer events and swallows clicks, so
     * keyboard activation cannot navigate either.
     */
    pending?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  tap = false,
  asChild = false,
  pending = false,
  children,
  disabled,
  onClick,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    buttonVariants({ variant, size, tap, className }),
    // The caller's own icons hide while pending; the Spinner stands in for them.
    pending && "[&>svg:not([data-slot=spinner])]:hidden",
  );
  const pendingProps = pending ? { "aria-busy": true, "data-pending": "" } : {};
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<Record<string, unknown>>;
    return cloneElement(child, {
      ...props,
      ...pendingProps,
      className: cn(
        classes,
        child.props.className as string | undefined,
        pending && "pointer-events-none opacity-50",
      ),
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      ...(disabled !== undefined ? { disabled } : {}),
      ...(pending
        ? {
            "aria-disabled": true,
            onClick: (event: MouseEvent) => event.preventDefault(),
            children: (
              <>
                <Spinner />
                {child.props.children as ReactNode}
              </>
            ),
          }
        : onClick !== undefined
          ? { onClick }
          : {}),
    });
  }
  return (
    <button
      type={type ?? "button"}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      disabled={disabled || pending}
      onClick={onClick}
      {...pendingProps}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

export { Button };
