import {
  buildSealFaucetCall,
  buildSetProtocolFeeActiveCall,
  ethFaucetSealAbi,
  FAUCET_SEAL_MAX,
  FAUCET_SEAL_PERIOD,
  FAUCET_SEAL_REGISTRY,
  FAUCET_SEAL_VALUE,
  protocolFeeControllerAbi,
} from "@clc/core/features/protocol-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { readContract } from "viem/actions";

import { PageHeader } from "#/components/admin/page-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { sameAddress, useOperatorAddress } from "#/features/operator/operator-address";
import { useOperatorCalls } from "#/features/operator/use-operator-calls";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";
import { errorMessage } from "#/lib/data-state";
import { formatFeePpm } from "#/lib/format";
import { useRelayDesk } from "#/features/dashboard/use-dashboard-metrics";

import { ProtocolContractLoader } from "./protocol-contract-loader";
import { ProtocolFeeForms } from "./protocol-fee-forms";

const FAUCET_BITS = [
  { bit: FAUCET_SEAL_REGISTRY, label: "Registry" },
  { bit: FAUCET_SEAL_PERIOD, label: "Period" },
  { bit: FAUCET_SEAL_VALUE, label: "Amount" },
] as const;

export function ProtocolPage() {
  const operator = useOperatorAddress();
  const calls = useOperatorCalls();
  const desk = useRelayDesk();
  const [loadedController, setLoadedController] = useState("");
  const [loadedFaucet, setLoadedFaucet] = useState("");
  const [sealMask, setSealMask] = useState(0);

  const fee = useQuery({
    queryKey: ["clc", "admin", "protocol-fee", loadedController],
    enabled: isAddress(loadedController),
    queryFn: () => readProtocolFee(loadedController as `0x${string}`),
  });
  const faucetState = useQuery({
    queryKey: ["clc", "admin", "faucet", loadedFaucet],
    enabled: isAddress(loadedFaucet),
    queryFn: () => readFaucet(loadedFaucet as `0x${string}`),
  });
  const ownsFee = sameAddress(operator, fee.data?.owner);
  const ownsFaucet = sameAddress(operator, faucetState.data?.owner);

  async function send(
    label: string,
    build: () => Parameters<typeof calls.mutateAsync>[0][number],
  ): Promise<boolean> {
    try {
      await calls.mutateAsync([build()]);
      toast.success(label);
      if (loadedController) await fee.refetch();
      if (loadedFaucet) await faucetState.refetch();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Protocol" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              Relay
            </h2>
          </CardHeader>
          <CardContent className="pt-4">
            <dl>
              <Row label="Relayer" value={desk.data?.relayerAddress || "—"} />
              <Row label="Chain" value={String(desk.data?.chainId ?? CHAIN_ID)} />
              <Row label="Idempotent" value={desk.data?.idempotentRelay ? "Yes" : "No"} />
              <Row label="System signer" value={desk.data?.systemSigner || "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              Protocol fee
            </h2>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <ProtocolContractLoader
              id="protocol-controller"
              label="Controller"
              onLoad={setLoadedController}
              pending={calls.isPending}
            />
            {fee.isError ? (
              <p role="alert" className="text-destructive text-xs">
                {errorMessage(fee.error)}
              </p>
            ) : null}
            {fee.data ? (
              <>
                <Row
                  label="Fee"
                  value={formatFeePpm(fee.data.active ? Number(fee.data.feePpm) : 0)}
                />
                <Row label="Recipient" value={fee.data.recipient} />
                <Row label="Active" value={fee.data.active ? "Yes" : "No"} />
                {ownsFee ? (
                  <>
                    <ProtocolFeeForms
                      key={loadedController}
                      controllerAddress={loadedController as `0x${string}`}
                      pending={calls.isPending}
                      onSend={send}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={calls.isPending}
                      onClick={() =>
                        void send(
                          fee.data?.active ? "Protocol fee paused" : "Protocol fee resumed",
                          () =>
                            buildSetProtocolFeeActiveCall({
                              controllerAddress: loadedController as `0x${string}`,
                              active: !fee.data?.active,
                            }),
                        )
                      }
                    >
                      {fee.data.active ? "Pause" : "Resume"}
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              Faucet
            </h2>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <ProtocolContractLoader
              id="faucet-address"
              label="Faucet"
              onLoad={(address) => {
                setLoadedFaucet(address);
                setSealMask(0);
              }}
              pending={calls.isPending}
            />
            {faucetState.isError ? (
              <p role="alert" className="text-destructive text-xs">
                {errorMessage(faucetState.error)}
              </p>
            ) : null}
            {faucetState.data ? (
              <>
                <div className="flex flex-wrap gap-1">
                  {faucetState.data.sealState === 0 ? (
                    <span className="font-mono text-xs uppercase">Open</span>
                  ) : (
                    FAUCET_BITS.filter(
                      (item) => (faucetState.data.sealState & item.bit) === item.bit,
                    ).map((item) => (
                      <Badge
                        key={item.bit}
                        variant="outline"
                        className="font-mono text-xs uppercase"
                      >
                        {item.label}
                      </Badge>
                    ))
                  )}
                </div>
                {ownsFaucet ? (
                  <>
                    {FAUCET_BITS.map((item) => {
                      const locked = (faucetState.data.sealState & item.bit) === item.bit;
                      return (
                        <label key={item.bit} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={locked || (sealMask & item.bit) === item.bit}
                            disabled={locked || calls.isPending || item.bit > FAUCET_SEAL_MAX}
                            onCheckedChange={(checked) =>
                              setSealMask((current) =>
                                checked ? current | item.bit : current & ~item.bit,
                              )
                            }
                          />
                          {item.label}
                        </label>
                      );
                    })}
                    <Button
                      type="button"
                      disabled={calls.isPending || sealMask === 0}
                      onClick={() =>
                        void send("Faucet sealed", () =>
                          buildSealFaucetCall({
                            faucetAddress: loadedFaucet as `0x${string}`,
                            state: sealMask,
                          }),
                        ).then((success) => {
                          if (success) setSealMask(0);
                        })
                      }
                    >
                      Seal
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-data min-w-0 truncate text-right text-xs">{value}</dd>
    </div>
  );
}

async function readProtocolFee(address: `0x${string}`) {
  const client = getChainClient(CHAIN_ID);
  const [fee, recipient, active, owner] = await Promise.all([
    readContract(client, {
      address,
      abi: protocolFeeControllerAbi,
      functionName: "getProtocolFee",
    }),
    readContract(client, {
      address,
      abi: protocolFeeControllerAbi,
      functionName: "getProtocolFeeRecipient",
    }),
    readContract(client, { address, abi: protocolFeeControllerAbi, functionName: "isActive" }),
    readContract(client, { address, abi: protocolFeeControllerAbi, functionName: "owner" }),
  ]);
  return {
    feePpm: typeof fee === "bigint" ? fee.toString() : "0",
    recipient: typeof recipient === "string" ? recipient : zeroAddress,
    active: active === true,
    owner: typeof owner === "string" ? owner : null,
  };
}

async function readFaucet(address: `0x${string}`) {
  const client = getChainClient(CHAIN_ID);
  const [sealState, owner] = await Promise.all([
    readContract(client, { address, abi: ethFaucetSealAbi, functionName: "sealState" }),
    readContract(client, { address, abi: ethFaucetSealAbi, functionName: "owner" }),
  ]);
  return {
    sealState: typeof sealState === "number" ? sealState : 0,
    owner: typeof owner === "string" ? owner : null,
  };
}
