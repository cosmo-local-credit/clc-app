import type { ReactElement } from "react";
import type { IconType } from "react-icons";
import { FaGoogle } from "react-icons/fa";
import {
  RiCake3Line,
  RiCheckLine,
  RiFingerprintLine,
  RiHandCoinLine,
  RiShoppingBasketLine,
  RiStore2Line,
  RiUserLine,
  RiWallet3Line,
} from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { cn } from "#/lib/utils";

export type GuideArtName =
  | "network"
  | "voucher"
  | "offer"
  | "pool"
  | "send"
  | "receive"
  | "wallet"
  | "link";

const LINE = "fill-none stroke-foreground stroke-[1.5]";
const DASHED = "fill-none stroke-muted-foreground stroke-[1.25] [stroke-dasharray:3_4]";
const CARD = "fill-card stroke-foreground stroke-[1.5]";

function Node({
  x,
  y,
  icon: Icon,
  primary = false,
  size = 40,
}: {
  x: number;
  y: number;
  icon: IconType;
  primary?: boolean;
  size?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} className={primary ? "fill-primary" : CARD} />
      <Icon
        x={x + size / 4}
        y={y + size / 4}
        size={size / 2}
        className={primary ? "text-primary-foreground" : "text-foreground"}
      />
    </g>
  );
}

/** A voucher's ticker on a chip. Tickers are symbols, not copy, so nothing here is translated. */
function Chip({
  x,
  y,
  label,
  primary = false,
  width = 64,
}: {
  x: number;
  y: number;
  label: string;
  primary?: boolean;
  width?: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={20}
        className={primary ? "fill-primary/10 stroke-primary stroke-[1.5]" : CARD}
      />
      <text
        x={x + width / 2}
        y={y + 14}
        textAnchor="middle"
        fontSize={11}
        className={cn("font-mono font-semibold", primary ? "fill-primary" : "fill-foreground")}
      >
        {label}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  x2,
  y,
  primary = false,
}: {
  x1: number;
  x2: number;
  y: number;
  primary?: boolean;
}) {
  return (
    <path
      d={`M${x1} ${y}H${x2}M${x2 - 6} ${y - 5}L${x2} ${y}L${x2 - 6} ${y + 5}`}
      className={primary ? "fill-none stroke-primary stroke-[1.5]" : LINE}
    />
  );
}

function Logo({
  x,
  y,
  size,
  sharp = false,
}: {
  x: number;
  y: number;
  size: number;
  sharp?: boolean;
}) {
  return (
    <svg x={x} y={y} width={size} height={size}>
      <CLCLogo sharp={sharp} />
    </svg>
  );
}

/**
 * A stand-in for a QR code: real finder patterns around a fixed scatter of
 * modules. It only has to read as "a code to scan"; it encodes nothing.
 */
function Qr({ x, y, size, seed }: { x: number; y: number; size: number; seed: number }) {
  const n = 25;
  const m = size / n;
  let state = seed;
  const next = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const square = (column: number, row: number, span: number) =>
    `M${x + column * m} ${y + row * m}h${span * m}v${span * m}h${-span * m}z`;
  const inFinder = (row: number, column: number) =>
    (row < 8 && column < 8) || (row < 8 && column >= n - 8) || (row >= n - 8 && column < 8);
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let column = 0; column < n; column++) {
      if (!inFinder(row, column) && next() < 0.48) d += square(column, row, 1);
    }
  }
  for (const [column, row] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    d += square(column, row, 7) + square(column + 1, row + 1, 5) + square(column + 2, row + 2, 3);
  }
  return <path d={d} fillRule="evenodd" className="fill-foreground" />;
}

const ART: Record<GuideArtName, () => ReactElement> = {
  network: () => (
    <>
      <path d="M56 40L150 80M56 120L150 80M244 40L150 80M244 120L150 80" className={DASHED} />
      <Node x={36} y={20} icon={RiStore2Line} />
      <Node x={36} y={100} icon={RiUserLine} />
      <Node x={224} y={20} icon={RiShoppingBasketLine} />
      <Node x={224} y={100} icon={RiHandCoinLine} />
      <Logo x={122} y={52} size={56} sharp />
    </>
  ),
  voucher: () => (
    <>
      <Node x={14} y={60} icon={RiStore2Line} />
      <Arrow x1={60} x2={86} y={80} />
      <rect x={94} y={44} width={112} height={72} className={CARD} />
      <path d="M178 44V116" className={DASHED} />
      <text x={106} y={70} fontSize={11} className="fill-primary font-mono font-semibold">
        BAKE
      </text>
      <rect x={106} y={84} width={56} height={5} className="fill-border" />
      <rect x={106} y={96} width={38} height={5} className="fill-border" />
      <RiCheckLine x={183} y={71} size={18} className="text-primary" />
      <Arrow x1={214} x2={240} y={80} />
      <Node x={246} y={60} icon={RiCake3Line} />
    </>
  ),
  offer: () => (
    <>
      <rect x={75} y={10} width={150} height={140} className={CARD} />
      <rect x={83} y={18} width={134} height={62} className="fill-muted" />
      <RiCake3Line x={136} y={35} size={28} className="text-foreground" />
      <rect x={83} y={90} width={104} height={6} className="fill-border" />
      <rect x={83} y={102} width={72} height={6} className="fill-border" />
      <Chip x={83} y={120} label="BAKE" primary width={60} />
      <RiStore2Line x={195} y={121} size={18} className="text-foreground" />
    </>
  ),
  pool: () => (
    <>
      <Chip x={10} y={70} label="BAKE" />
      <Arrow x1={78} x2={100} y={80} />
      <rect x={106} y={14} width={88} height={132} className={CARD} />
      <Chip x={118} y={32} label="BAKE" />
      <Chip x={118} y={70} label="FARM" primary />
      <Chip x={118} y={108} label="RIDE" />
      <Arrow x1={200} x2={222} y={80} />
      <Chip x={226} y={70} label="FARM" primary />
    </>
  ),
  send: () => (
    <>
      <Node x={26} y={58} icon={RiWallet3Line} size={44} />
      <Chip x={112} y={52} label="20 BAKE" primary width={76} />
      <Arrow x1={80} x2={220} y={86} primary />
      <Node x={230} y={58} icon={RiUserLine} size={44} />
    </>
  ),
  receive: () => (
    <>
      <rect x={40} y={14} width={112} height={112} className={CARD} />
      <Qr x={48} y={22} size={96} seed={5} />
      <Arrow x1={162} x2={214} y={70} />
      <Node x={222} y={48} icon={RiWallet3Line} size={44} primary />
    </>
  ),
  wallet: () => (
    <>
      <rect x={22} y={30} width={160} height={100} className={cn(CARD, "[stroke-dasharray:4_3]")} />
      <Logo x={32} y={40} size={30} />
      <rect x={32} y={96} width={62} height={6} className="fill-border" />
      <rect x={32} y={108} width={40} height={6} className="fill-border" />
      <rect x={116} y={40} width={56} height={56} className={CARD} />
      <Qr x={120} y={44} size={48} seed={9} />
      <Node x={214} y={26} icon={RiWallet3Line} size={52} primary />
      <Chip x={206} y={90} label="BAKE" width={68} />
      <Chip x={206} y={116} label="FARM" width={68} />
    </>
  ),
  link: () => (
    <>
      <rect x={26} y={40} width={120} height={76} className={cn(CARD, "[stroke-dasharray:4_3]")} />
      <Logo x={34} y={48} size={24} />
      <rect x={100} y={48} width={38} height={38} className={CARD} />
      <Qr x={103} y={51} size={32} seed={3} />
      <rect x={34} y={96} width={54} height={5} className="fill-border" />
      <path d="M152 78H196" className={DASHED} />
      <Node x={204} y={50} icon={RiFingerprintLine} size={56} />
      <rect x={246} y={38} width={24} height={24} className={CARD} />
      <FaGoogle x={251} y={43} size={14} className="text-foreground" />
    </>
  ),
};

/**
 * The picture above each guide slide: a flat diagram in the screen's own
 * tokens, so it follows theme and brand. It draws left to right in every
 * language, like the QR codes and addresses it shows.
 */
export function GuideArt({ name, className }: { name: GuideArtName; className?: string }) {
  const Art = ART[name];
  return (
    <div
      className={cn("relative border border-border bg-card", className)}
      dir="ltr"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 300 160"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
      >
        <Art />
      </svg>
    </div>
  );
}
