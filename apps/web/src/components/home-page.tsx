import { BadgeCheck, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { WalletAccessPanel } from "#/components/wallet-access-panel";

export function HomePage() {
	const { address, isConnected } = useAccount();

	if (!isConnected) {
		return <WalletAccessPanel />;
	}

	return (
		<div className="flex min-h-screen flex-col bg-background px-6 pb-12 pt-20">
			<div className="mb-8 flex flex-col items-center gap-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground text-background">
					<Wallet className="size-7" />
				</div>
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-semibold">
						Wallet connected
					</h1>
					<p className="text-sm text-muted-foreground">
						The authenticated shell is available only after a wallet connection.
					</p>
				</div>
			</div>

			<div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
				<BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
				<div className="min-w-0 space-y-0.5">
					<p className="text-sm font-medium">Connected address</p>
					<p className="truncate font-mono text-xs text-muted-foreground">
						{address}
					</p>
				</div>
			</div>
		</div>
	);
}
