import { createConfig, createStorage, http } from "wagmi";
import { celo } from "wagmi/chains";
import { caliburWebAuthnConnector } from "#/connectors/calibur-webauthn";
import { privateKeyConnector } from "#/connectors/privateKey";

const PUBLIC_RPC_URL =
	(import.meta.env.VITE_PUBLIC_RPC_URL as string | undefined) ??
	"https://forno.celo.org";

const storage =
	typeof window !== "undefined"
		? createStorage({ storage: window.localStorage })
		: undefined;

// Singleton connector instances. A single uid is required for wagmi to
// serialise/deserialise these connections in its localStorage store. Creating a
// new instance on every call produces a different uid, which causes wagmi to
// drop the connection entry during its next serialisation pass.
export const pkConnector = privateKeyConnector();
export const caliburConnector = caliburWebAuthnConnector();

export const wagmiConfig = createConfig({
	chains: [celo],
	transports: {
		[celo.id]: http(PUBLIC_RPC_URL),
	},
	storage,
	connectors: [pkConnector, caliburConnector],
});
