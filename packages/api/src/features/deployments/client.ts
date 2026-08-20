import {
  type HexAddress,
  normalizeHex,
  normalizeNumber,
  normalizeStringArray,
  normalizeText,
} from "../../lib/api-normalize";
import type { HttpClient } from "../../client/http-client";

export type DeploymentContractType = "POOL" | "TOKEN";

export type DeploymentContract = {
  address: HexAddress | null;
  admin: HexAddress | null;
  name: string;
  symbol: string;
  status: string;
  /** Needed to scale an issuer's opening supply into raw token units. */
  decimals: number | null;
};

type BackendDeploymentContract = Partial<{
  address: string | null;
  admin: string;
  name: string;
  symbol: string;
  status: string;
  decimals: number;
}>;

type BackendDeploymentResult = {
  type?: unknown;
  contract?: BackendDeploymentContract | null;
};

const DEPLOYMENT_LABELS: Record<DeploymentContractType, { noun: string; sentenceNoun: string }> = {
  POOL: { noun: "pool", sentenceNoun: "Pool" },
  TOKEN: { noun: "voucher", sentenceNoun: "Voucher" },
};

export type DeploymentsClient = ReturnType<typeof createDeploymentsClient>;

export function createDeploymentsClient(http: HttpClient) {
  return {
    async getTokenTags(signal?: AbortSignal): Promise<string[]> {
      const result = await http.request<{ tags?: unknown }>("/api/v2/token-tags", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      return normalizeStringArray(result.tags);
    },

    async getDeploymentContract(
      trackingId: string,
      expectedType: DeploymentContractType,
      signal?: AbortSignal,
    ): Promise<DeploymentContract | null> {
      const result = await http.request<BackendDeploymentResult | null>(
        `/api/v2/otx/track/${encodeURIComponent(trackingId)}/contract`,
        { method: "GET", cache: "no-store", signal },
      );
      if (!result) return null;

      const label = DEPLOYMENT_LABELS[expectedType];
      if (result.type !== expectedType) {
        throw new Error(`Tracking ID does not belong to a ${label.noun} deployment.`);
      }

      const contract = result.contract;
      const name = normalizeText(contract?.name);
      const symbol = normalizeText(contract?.symbol);
      const status = normalizeText(contract?.status);
      if (!contract || !name || !symbol || !status) {
        throw new Error(`${label.sentenceNoun} deployment response was incomplete.`);
      }

      return {
        address: normalizeHex(contract.address),
        admin: normalizeHex(contract.admin),
        name,
        symbol,
        status,
        decimals: normalizeNumber(contract.decimals),
      };
    },
  };
}
