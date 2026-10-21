#!/usr/bin/env bash
set -euo pipefail
integration_root="$(cd "$(dirname "$0")" && pwd)"
app_root="$(cd "$integration_root/../.." && pwd)"
protocol_source="${CLC_PROTOCOL_ARTIFACTS:-$app_root/../clc-protocol/out}"
calibur_source="${CLC_CALIBUR_ARTIFACTS:-$app_root/../calibur/out}"
mkdir -p "$integration_root/artifacts/protocol" "$integration_root/artifacts/calibur/CaliburEntry.sol"
for contract in TokenUniqueSymbolIndex Limiter FeePolicy DecimalQuoter RelativeQuoter OracleQuoter SwapPool; do
  mkdir -p "$integration_root/artifacts/protocol/$contract.sol"
  cp "$protocol_source/$contract.sol/$contract.json" "$integration_root/artifacts/protocol/$contract.sol/"
done
cp "$calibur_source/CaliburEntry.sol/CaliburEntry.json" "$integration_root/artifacts/calibur/CaliburEntry.sol/"
export CLC_PROTOCOL_ARTIFACTS="$integration_root/artifacts/protocol"
export CLC_CALIBUR_ARTIFACTS="$integration_root/artifacts/calibur"
forge test --root "$integration_root" -vv
