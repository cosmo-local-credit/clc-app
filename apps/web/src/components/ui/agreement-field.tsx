import { Checkbox } from "#/components/ui/checkbox";
import { FieldError } from "#/components/ui/field";

export function AgreementField({
  id,
  checked,
  onCheckedChange,
  error,
  title,
  description,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5 text-xs leading-relaxed"
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-invalid={!!error}
          className="mt-0.5"
        />
        <span>
          <strong className="block font-medium text-foreground">{title}</strong>
          <span className="text-muted-foreground">{description}</span>
        </span>
      </label>
      {error ? <FieldError error={error} /> : null}
    </div>
  );
}
