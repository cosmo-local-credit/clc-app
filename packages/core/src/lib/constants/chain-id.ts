/**
 * The chain id a build's `VITE_CHAIN_ID` names. Unset means Gnosis (100).
 *
 * Each app's `#/lib/chain` and its build identity, resolved in the app's Vite
 * config, both read the variable through this, so the default lives in one
 * place. Validation stays with the caller: an id the chain table carries
 * nothing for fails an app at boot. Do not reintroduce a Celo default.
 *
 * Node loads this file directly from the Vite configs, which externalize
 * workspace packages, so it imports nothing: Node's loader cannot resolve
 * core's extensionless relative imports.
 */
export function resolveChainId(raw: string | undefined): number {
  return Number(raw ?? "100");
}
