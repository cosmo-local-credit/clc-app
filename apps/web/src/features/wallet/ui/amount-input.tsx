import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "#/lib/utils";

type WalletAmountInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "className" | "onChange" | "size" | "value"
> & {
  id: string;
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  variant?: "compact" | "display";
  align?: "center" | "left" | "right";
  leading?: ReactNode;
  trailing?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
};

function WalletAmountInput({
  id,
  label,
  value,
  onValueChange,
  variant = "compact",
  align = "right",
  leading,
  trailing,
  action,
  footer,
  error,
  disabled,
  hideLabel = false,
  type = "text",
  inputMode = "decimal",
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: WalletAmountInputProps) {
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [ariaDescribedBy, errorId].filter((part): part is string => Boolean(part)).join(" ") ||
    undefined;
  const inputAriaInvalid = ariaInvalid ?? (error ? true : undefined);
  const invalid =
    Boolean(error) ||
    inputAriaInvalid === true ||
    inputAriaInvalid === "true" ||
    inputAriaInvalid === "grammar" ||
    inputAriaInvalid === "spelling";

  return (
    <div className="space-y-1.5">
      {hideLabel ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : null}

      {!hideLabel || action ? (
        <div className="flex items-center justify-between gap-3">
          {hideLabel ? null : (
            <label htmlFor={id} className="text-muted-foreground text-xs">
              {label}
            </label>
          )}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      <div
        className={cn(
          "border border-border bg-card transition-[border-color]",
          "focus-within:border-foreground",
          invalid && "border-destructive focus-within:border-destructive",
          disabled && "opacity-50",
          variant === "display" ? "px-4 py-5" : "px-3.5 py-2",
        )}
        aria-disabled={disabled || undefined}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            align === "center" && "justify-center",
            align === "right" && "justify-end",
            align === "left" && "justify-start",
          )}
        >
          {leading ? <span className="shrink-0">{leading}</span> : null}
          <input
            id={id}
            type={type}
            inputMode={inputMode}
            value={value}
            disabled={disabled}
            aria-invalid={inputAriaInvalid}
            aria-describedby={describedBy}
            className={cn(
              "min-w-0 border-0 bg-transparent p-0 font-heading font-semibold outline-none",
              "selection:bg-primary selection:text-primary-foreground",
              "disabled:cursor-not-allowed",
              variant === "display"
                ? "max-w-full text-[2.5rem] leading-none"
                : "text-[1.625rem] leading-none",
              align === "center" && "text-center",
              align === "right" && "text-right",
              align === "left" && "text-left",
              trailing || leading ? "w-auto flex-1" : "w-full",
            )}
            onChange={(event) => onValueChange(event.target.value)}
            {...props}
          />
          {trailing ? (
            <span
              className={cn(
                "shrink-0 text-muted-foreground",
                variant === "display" ? "text-[1.25rem]" : "text-sm font-bold",
              )}
            >
              {trailing}
            </span>
          ) : null}
        </div>

        {footer ? (
          <div
            className={cn(
              "mt-3 flex",
              align === "center" && "justify-center",
              align === "right" && "justify-end",
              align === "left" && "justify-start",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { WalletAmountInput };
