import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { WalletAccessPanel } from "#/components/wallet-access-panel";

export function SignupPage() {
	const { isConnected } = useAccount();
	const navigate = useNavigate();

	useEffect(() => {
		if (isConnected) {
			navigate({ to: "/", replace: true });
		}
	}, [isConnected, navigate]);

	if (isConnected) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<div className="text-center space-y-4">
					<LoaderCircle className="mx-auto size-8 animate-spin text-primary" />
					<p className="text-muted-foreground text-sm">Redirecting…</p>
				</div>
			</div>
		);
	}

	return <WalletAccessPanel />;
}
