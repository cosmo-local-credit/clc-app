import { createConfig, createStorage, http } from "wagmi";
import { caliburWebAuthnConnector } from "#/connectors/calibur-webauthn";
import { privateKeyConnector } from "#/connectors/privateKey";
import { CHAIN, PUBLIC_RPC_URL } from "#/lib/chain";

const storage =
  typeof window !== "undefined" ? createStorage({ storage: window.localStorage }) : undefined;

// Singleton connector instances. A single uid is required for wagmi to
// serialise/deserialise these connections in its localStorage store. Creating a
// new instance on every call produces a different uid, which causes wagmi to
// drop the connection entry during its next serialisation pass.
export const pkConnector = privateKeyConnector();
export const caliburConnector = caliburWebAuthnConnector();

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  transports: {
    [CHAIN.id]: http(PUBLIC_RPC_URL),
  },
  // Defer wagmi's onMount() to useEffect so it never fires during SSR render,
  // preventing the synchronous store mutation that causes React 19 to throw.
  ssr: true,
  storage,
  connectors: [pkConnector, caliburConnector],
});
