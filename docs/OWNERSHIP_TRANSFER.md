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

## Safe-owned assets

`VITE_SAFE_OWNERSHIP_ENABLED` (off in both Wrangler blocks) lets a Safe own a
voucher or pool and its signers manage it from the app. Flip it only after the
whole chain below is live in that environment.

1. eth-tracker with `SAFE_OWNERS_CHANGED` (`feat/safe-owner-events`) deployed.
2. clc-core with migration `060_safe_signers.sql`, then `safe.multisend_call_only`
   (the Gnosis `MultiSendCallOnly` 1.3.0 and 1.4.1 addresses) and `safe.sts_base_url`
   set in its config. Without them `execTransaction` is refused at the relay and
   the `/api/v2/safe` routes are not mounted.
3. Re-run `cmd/reconcile-ownership` at a finalized block so existing Safe owners
   are cached (the snapshot now includes them), and make sure the tracker watches
   those Safes.

Use a staging 2-of-3 Safe: transfer a voucher to it, then have a signer propose a
mint, a second signer confirm and execute it from the Safe transactions row, and
reject a queued transaction. Check that a removed signer loses the controls once
the tracker has reported `RemovedOwner`. Passkey wallets cannot sign for a Safe
yet; paper wallets and external wallets can.
