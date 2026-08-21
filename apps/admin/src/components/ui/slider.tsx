"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "#/lib/utils";

/**
 * Ported to Base UI: the shadcn registry ships this on Radix, which this repo
 * does not use. The parts are the same four — root, control, track, indicator,
 * thumb — so the classes carry over; only the primitive changed.
 *
 * A single-value slider. Base UI models the value as an array to cover ranges;
 * this wrapper keeps the common case a number, because every use here is one
 * handle and unwrapping at each call site is where an off-by-one creeps in.
 */
function Slider({
  className,
  value,
  onValueChange,
  ...props
}: Omit<SliderPrimitive.Root.Props, "value" | "onValueChange" | "defaultValue"> & {
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control data-slot="slider-control" className="flex w-full items-center py-2">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative h-1.5 w-full grow overflow-hidden"
        >
          <SliderPrimitive.Indicator data-slot="slider-indicator" className="bg-primary h-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="border-primary bg-background focus-visible:ring-ring/50 block size-4 shrink-0 rounded-full border shadow-none transition-[color,box-shadow] outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
