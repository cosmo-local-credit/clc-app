import { type ComponentProps, useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  showLabel?: string;
  hideLabel?: string;
};

export function PasswordInput({
  className,
  disabled,
  showLabel = "Show password",
  hideLabel = "Hide password",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? hideLabel : showLabel;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pe-10", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={actionLabel}
        aria-pressed={visible}
        title={actionLabel}
        className="absolute inset-y-0 end-0 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <FiEye data-icon="eye-open" aria-hidden="true" />
        ) : (
          <FiEyeOff data-icon="eye-closed" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
