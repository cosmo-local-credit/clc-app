# Ownership transfer rollout

Pool handover is behind `VITE_POOL_OWNERSHIP_TRANSFER_ENABLED`, set per
environment in `wrangler.toml`: `[env.preview.vars]` is staging (`develop`) and
`[vars]` is prod (`master`). Flip staging only after staging's backend is
deployed and reconciled, and prod only after prod's; a prod flip goes live with
the next promotion.

## Backend first

In the sibling `clc-core` repository:

1. Deploy the subscriber/store changes and migration
   `054_catalog_ownership.sql` (branch `sohail/catalog-ownership`). The subscriber must use its configured
   `chain.id` and consume `TRACKER.OWNERSHIP_TRANSFERRED` events from the same
   chain. The existing durable consumer covers all `TRACKER.*` subjects.
2. Choose an explicit finalized Gnosis block. Using that environment's database
   credentials through `CORE_RECONCILE_DSN`, run from the backend repository:

   ```sh
   go run ./cmd/reconcile-ownership --chain 100 --rpc "$OWNERSHIP_RPC_URL" --block "$OWNERSHIP_BLOCK" > ownership-snapshot.jsonl
   ```

   Review the snapshot, then repeat with `--apply` and the **same block**. Keep
   the output, which records the block hash as well as every previous/current
   owner. The command checks the RPC chain, requires a finalized block, refuses
   malformed owner reads, and applies the snapshot in one transaction. It does
   not migrate the database or send on-chain transactions. Any failed read
   aborts the run; no asset is silently skipped.

3. Check several voucher/pool detail responses against `owner()` at that block.
   A reconciliation snapshot is ordered after every log in its block; later
   events still win. Repeating it cannot overwrite a newer projection.
4. Deploy the frontend. Staging's build has the flag on; prod's stays off until
   its own backend deployment and reconciliation are complete, then master's
   value changes to `"true"`.

## Staging smoke test

Use a staging pool and two controlled wallets. Confirm all pool contracts have
the sender as owner before starting. Transfer from the final owner-only row in
Pool controls. Decimal pools hand over four owned contracts; relative/oracle
pools hand over five. The registry, limiter, fee policy and owned quoter move
first, then SwapPool, in one atomic Calibur batch.

Check that the sender immediately loses controls, the catalog and both owned
lists converge, and the recipient can edit the profile, approve/configure
vouchers, set limits/prices/fees, and withdraw liquidity. Check every target's
`owner()` and the unchanged fee recipient. Repeat a voucher handover. Preserve
metadata, balances, memberships, writer grants, deployment `admin` and offering
seller attribution; proxy upgrade administration stays with the platform.

If settlement is uncertain, reopen the sheet and use **Check transfer status**.
The tracking ID and intended recipient survive reloads. This checks the existing
submission without a new signature. A confirmed transfer with catalog lag is
reported separately and keeps sender controls removed even after reload. A
lagging RPC head cannot restore old authority: ownership refreshes must reach
the confirmed receipt's block.

## Verification

```sh
vp check
vp test packages/core/src/features/pool-admin/ apps/web/src/features/ownership/ apps/web/src/features/pools/hooks/-use-pool-ownership-transfer.test.ts apps/web/src/features/pools/ui/-pool-controls-panel.test.tsx apps/web/src/features/pools/ui/-pool-detail-page.test.tsx apps/web/src/features/vouchers/hooks/-use-voucher-ownership-transfer.test.tsx apps/web/src/features/wallet/ui/-voucher-detail-page.test.tsx apps/web/src/lib/-ui-contract.test.ts
```

The EVM integration uses real artifacts built by the sibling `clc-protocol` and
`calibur` repositories. With Foundry installed and those repositories built:

```sh
tooling/ownership-integration/run.sh
```

Override `CLC_PROTOCOL_ARTIFACTS` / `CLC_CALIBUR_ARTIFACTS` if their `out/` folders
are elsewhere. Six tests exercise signed delegated execution for all three
pricing modes, including rollback of every earlier transfer when SwapPool's
handover fails. Copied artifacts and Foundry output stay untracked.

Backend tests (from `clc-core`):

```sh
go test ./internal/sub ./internal/store ./internal/api ./migrations ./cmd/reconcile-ownership
CORE_TEST_DSN="$OWNERSHIP_TEST_DSN" go test -p 1 ./internal/sub ./internal/store ./internal/api -run 'Ownership|ExternalRelayer|TransferredAuthority|Upsert.*FromDeploy|Profile|Offering' -count=1
```

Use an isolated migrated test database for the integration run.

## Multisig-owned assets

`VITE_SAFE_OWNERSHIP_ENABLED` (off in both Wrangler blocks) enables multisig
ownership and single-signer metadata editing. Enable it after the tracker and
backend below are deployed. Metadata and public ownership do not require the
Safe Transaction Service or gasless Safe execution.

1. Deploy eth-tracker with `SAFE_OWNERS_CHANGED` and compatible `getOwners()`
   detection.
2. Deploy clc-core with migrations `060_safe_signers.sql` and
   `061_safe_compatible_owners.sql`. Configure `chain.ge_registry` as for signup;
   the system signer must be an AccountIndex writer.
3. A successful ownership transfer discovers the new multisig. Viewing an
   existing multisig-owned asset calls `GET /api/v2/owners/:address`, which
   persists its verified signer set. Both paths enqueue the existing account
   registration worker. That worker checks `contains(address)` before signing,
   so repeated discovery does not send duplicate index additions.
4. AccountIndex's ordinary `AddressAdded` event starts normal tracking. Its
   enumeration and the tracker's persisted cache provide restart/recovery.
   `cmd/reconcile-ownership` remains a repair tool, not a normal onboarding step.
5. Optional proposals: set `safe.sts_base_url`, its API key where required, and
   the matching Gnosis `safe.multisend_call_only` addresses in clc-core. Missing
   STS or an unsupported signer/contract opens the dashboard handoff; metadata
   still works.

Any one current signer can edit voucher/pool profiles, voucher display names,
create/update/delete offerings within their allowance, link owned assets to
posts, reply to/flag reviews, and retire vouchers. Posts and review replies
retain the real author's address. On-chain changes still require the multisig's
own approval threshold.

A valid `getOwners()` list is sufficient for metadata recognition. `VERSION()`
is not required; `getThreshold()` is optional and is displayed only if known.
Custom implementations get partial support: automatic membership changes require
Safe-style owner events; viewing the asset refreshes its stored signer set when
those events are absent. Transaction proposals depend on compatible nonce,
transaction hashing, signatures and STS indexing, and are best effort.

The app only proposes transactions, including at threshold one. Confirmation,
execution and rejection happen in Safe. No local submission store or terminal
transaction state is promised. Refresh the asset in CLC after execution. Passkey
sessions can edit metadata; passkey transaction proposals are not supported.

### Quick QA

Use a Gnosis 2-of-3 Safe containing a paper-wallet signer and dashboard signers.
Transfer a test voucher and pool to it, and also inspect an asset already owned
by the Safe. Check the public ownership label while signed out. Each signer must
independently edit metadata, use their offering allowance, post and manage review
replies. An outsider and a removed signer must be denied by the API. Verify one
AccountIndex addition despite repeated inspection; restart the tracker and change
a signer again. Queue a small mint with the paper wallet: it must not execute
until confirmed/executed in Safe. Refresh CLC afterward. With STS disabled or a
passkey session, metadata must still work and the dashboard link remain usable.
