import {
  buildSealFaucetCall,
  buildSetProtocolFeeActiveCall,
  buildSetProtocolFeeCall,
  buildSetProtocolFeeRecipientCall,
  ethFaucetSealAbi,
  FAUCET_SEAL_MAX,
  FAUCET_SEAL_PERIOD,
  FAUCET_SEAL_REGISTRY,
  FAUCET_SEAL_VALUE,
  protocolFeeControllerAbi,
} from "@clc/core/features/protocol-admin/logic";
import { POOL_FEE_PERCENT_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { readContract } from "viem/actions";

import { PageHeader } from "#/components/admin/page-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { sameAddress, useOperatorAddress } from "#/features/operator/operator-address";
import { useOperatorCalls } from "#/features/operator/use-operator-calls";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";
import { errorMessage } from "#/lib/data-state";
import { formatFeePpm } from "#/lib/format";
import { useRelayDesk } from "#/features/dashboard/use-dashboard-metrics";

const FAUCET_BITS = [
  { bit: FAUCET_SEAL_REGISTRY, label: "Registry" },
  { bit: FAUCET_SEAL_PERIOD, label: "Period" },
  { bit: FAUCET_SEAL_VALUE, label: "Amount" },
] as const;

export function ProtocolPage() {
  const operator = useOperatorAddress();
  const calls = useOperatorCalls();
  const desk = useRelayDesk();
  const [controller, setController] = useState("");
  const [loadedController, setLoadedController] = useState("");
  const [percent, setPercent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [faucet, setFaucet] = useState("");
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

  async function send(label: string, call: Parameters<typeof calls.mutateAsync>[0][number]) {
    try {
      await calls.mutateAsync([call]);
      toast.success(label);
      await fee.refetch();
      await faucetState.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Protocol" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Relay
            </CardTitle>
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
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Protocol fee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <Label htmlFor="protocol-controller">Controller</Label>
            <div className="flex gap-2">
              <Input
                id="protocol-controller"
                className="font-data"
                value={controller}
                onChange={(event) => setController(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => isAddress(controller) && setLoadedController(controller)}
              >
                Load
              </Button>
            </div>
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
                    <Label htmlFor="protocol-percent">Percent</Label>
                    <Input
                      id="protocol-percent"
                      inputMode="decimal"
                      className="font-data"
                      value={percent}
                      onChange={(event) => setPercent(event.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={calls.isPending}
                      onClick={() =>
                        void send(
                          "Protocol fee updated",
                          buildSetProtocolFeeCall({
                            controllerAddress: loadedController as `0x${string}`,
                            feePpm: parseTokenAmount(percent.trim(), POOL_FEE_PERCENT_DECIMALS),
                          }),
                        )
                      }
                    >
                      Save fee
                    </Button>
                    <Label htmlFor="protocol-recipient">Recipient</Label>
                    <Input
                      id="protocol-recipient"
                      className="font-data"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={calls.isPending || !isAddress(recipient)}
                      onClick={() =>
                        void send(
                          "Recipient updated",
                          buildSetProtocolFeeRecipientCall({
                            controllerAddress: loadedController as `0x${string}`,
                            recipientAddress: recipient as `0x${string}`,
                          }),
                        )
                      }
                    >
                      Save recipient
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={calls.isPending}
                      onClick={() =>
                        void send(
                          fee.data?.active ? "Protocol fee paused" : "Protocol fee resumed",
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
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Faucet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <Label htmlFor="faucet-address">Faucet</Label>
            <div className="flex gap-2">
              <Input
                id="faucet-address"
                className="font-data"
                value={faucet}
                onChange={(event) => setFaucet(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => isAddress(faucet) && setLoadedFaucet(faucet)}
              >
                Load
              </Button>
            </div>
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
                        void send(
                          "Faucet sealed",
                          buildSealFaucetCall({
                            faucetAddress: loadedFaucet as `0x${string}`,
                            state: sealMask,
                          }),
                        ).then(() => setSealMask(0))
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
