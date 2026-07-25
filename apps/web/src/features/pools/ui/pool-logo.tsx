import { cn } from "#/lib/utils";

export type PoolLogoProps = {
  imageUrl: string | null | undefined;
  name: string;
  seed: string;
  size?: number;
  className?: string;
};

export function PoolLogo({ imageUrl, name, seed, size = 44, className }: PoolLogoProps) {
  const initials = initialsFromName(name);
  const dimensions = { width: size, height: size };

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${name} logo`}
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={dimensions}
      />
    );
  }

  return (
    <span
      aria-label={`${name} avatar`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-heading font-bold text-sm text-white",
        className,
      )}
      style={{ ...dimensions, background: hueFromSeed(seed || name) }}
    >
      {initials}
    </span>
  );
}

export function initialsFromName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase() ?? "")
    .join("");
  return initials || "P";
}

export function hueFromSeed(seed: string): string {
  let hue = 0;
  for (let index = 0; index < seed.length; index++) {
    hue = (hue * 31 + seed.charCodeAt(index)) % 360;
  }
  return `oklch(0.58 0.16 ${hue})`;
}
