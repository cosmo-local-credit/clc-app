import type {
	Chain,
	SignableMessage,
	TypedData,
	TypedDataDefinition,
} from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { CreateConnectorFn } from "wagmi";
import { createConnector } from "wagmi";

const STORAGE_KEY = "clc_pk_connected";
const ADDRESS_KEY = "clc_pk_address";
const PRIVATE_KEY_STORE = "clc_pk_raw";

export function getStoredKey(): `0x${string}` | null {
	const raw = localStorage.getItem(PRIVATE_KEY_STORE);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as `0x${string}`;
	} catch {
		return null;
	}
}

export function storePrivateKey(key: `0x${string}`) {
	localStorage.setItem(PRIVATE_KEY_STORE, JSON.stringify(key));
	localStorage.setItem(STORAGE_KEY, "true");
	const account = privateKeyToAccount(key);
	localStorage.setItem(ADDRESS_KEY, account.address);
}

export function clearPrivateKey() {
	localStorage.removeItem(PRIVATE_KEY_STORE);
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem(ADDRESS_KEY);
}

export function hasStoredPrivateKey(): boolean {
	return localStorage.getItem(STORAGE_KEY) === "true";
}

export function getStoredAddress(): string | null {
	return localStorage.getItem(ADDRESS_KEY);
}

export function privateKeyConnector() {
	return createConnector(((config) => {
		return {
			id: "private-key",
			name: "Private Key",
			type: "privateKey" as const,

			async connect(parameters?: {
				chainId?: number | undefined;
				isReconnecting?: boolean | undefined;
			}): Promise<{
				accounts: readonly `0x${string}`[];
				chainId: number;
			}> {
				void parameters;
				const key = getStoredKey();
				if (!key)
					throw new Error(
						"No private key stored. Store one first via storePrivateKey().",
					);
				const account = privateKeyToAccount(key);
				const chainId = config.chains[0]?.id ?? 42220;
				return {
					accounts: [account.address],
					chainId,
				};
			},

			async disconnect() {
				clearPrivateKey();
			},

			async getAccounts() {
				const key = getStoredKey();
				if (!key) return [] as const;
				const account = privateKeyToAccount(key);
				return [account.address] as const;
			},

			async getChainId() {
				return config.chains[0]?.id ?? 42220;
			},

			async getProvider() {
				const key = getStoredKey();
				if (!key) throw new Error("No private key stored");
				const account = privateKeyToAccount(key);
				const chain = config.chains[0] as Chain;
				const rpcUrl =
					(config.transports?.[chain.id] as { url?: string } | undefined)
						?.url ?? "https://forno.celo.org";
				const walletClient = createWalletClient({
					account,
					chain,
					transport: http(rpcUrl),
				});

				return {
					on: (_event: string, _fn: (...args: unknown[]) => void) => {},
					removeListener: (
						_event: string,
						_fn: (...args: unknown[]) => void,
					) => {},
					async request({
						method,
						params = [],
					}: {
						method: string;
						params?: readonly unknown[];
					}): Promise<unknown> {
						switch (method) {
							case "eth_accounts":
							case "eth_requestAccounts":
								return [account.address];

							case "eth_chainId":
								return `0x${chain.id.toString(16)}`;

							case "personal_sign": {
								const [data] = params as [`0x${string}`, `0x${string}`];
								return account.signMessage({ message: { raw: data } });
							}

							case "eth_sign":
								throw new Error("eth_sign is not supported");

							case "eth_signTypedData_v4": {
								const [, typedDataJson] = params as [`0x${string}`, string];
								const { domain, types, primaryType, message } = JSON.parse(
									typedDataJson,
								) as {
									domain: Record<string, unknown>;
									types: Record<string, unknown[]>;
									primaryType: string;
									message: Record<string, unknown>;
								};
								return account.signTypedData({
									domain,
									types,
									primaryType,
									message,
								} as Parameters<typeof account.signTypedData>[0]);
							}

							case "eth_sendTransaction": {
								const [tx] = params as [Record<string, string>];
								return walletClient.sendTransaction({
									...(tx.to && { to: tx.to as `0x${string}` }),
									...(tx.data && { data: tx.data as `0x${string}` }),
									...(tx.value && { value: BigInt(tx.value) }),
									...(tx.gas && { gas: BigInt(tx.gas) }),
								} as Parameters<typeof walletClient.sendTransaction>[0]);
							}

							default:
								return walletClient.request({ method, params } as Parameters<
									typeof walletClient.request
								>[0]);
						}
					},
				};
			},

			async isAuthorized() {
				return getStoredKey() !== null;
			},

			async switchChain({ chainId }: { chainId: number }) {
				const chain = config.chains.find((c) => c.id === chainId);
				if (chain) {
					config.emitter.emit("change", { chainId: chain.id });
				}
				return chain ?? config.chains[0];
			},

			onAccountsChanged() {},

			onChainChanged() {},

			onDisconnect() {},

			async signMessage({ message }: { message: SignableMessage }) {
				const key = getStoredKey();
				if (!key) throw new Error("No private key stored");
				const account = privateKeyToAccount(key);
				return account.signMessage({ message });
			},

			async signTypedData(typedData: TypedData | TypedDataDefinition) {
				const key = getStoredKey();
				if (!key) throw new Error("No private key stored");
				const account = privateKeyToAccount(key);
				return account.signTypedData(
					typedData as Parameters<typeof account.signTypedData>[0],
				);
			},
		};
	}) as CreateConnectorFn);
}
