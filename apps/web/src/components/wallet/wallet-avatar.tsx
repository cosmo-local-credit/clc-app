import type { ReactNode } from "react";

import { hueFromSeed } from "./wallet-data";

export function HueAvatar({
  seed,
  label,
  size = 30,
  icon,
}: {
  seed: string;
  label?: string;
  size?: number;
  icon?: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: hueFromSeed(seed) }}
    >
      {icon ?? label?.slice(0, 1).toUpperCase()}
    </span>
  );
}
