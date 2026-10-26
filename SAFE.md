# Multisig ownership

A voucher or pool may be owned by a Safe or a compatible multisig. Any one
current signer may manage its off-chain metadata. The multisig remains the
on-chain owner, and on-chain actions require its own approval threshold.

## Durable signer projection

clc-core stores membership in PostgreSQL `safe_state` and `safe_signers`, keyed
by chain and owner address. These are a durable projection of tracker events,
not an expiring permission cache. Ordinary metadata writes read that projection;
permissions do not expire merely because no owner event has occurred recently.
Safe-style AddedOwner, RemovedOwner and ChangedThreshold events replace the
whole signer set at the event block. Block/log ordering prevents replay from
rolling the projection backwards.

One signer can update profiles and display names, publish/update/remove
voucher offerings within their allowance, link owned vouchers/pools to posts,
reply to/flag voucher reviews, and retire a voucher. Authorship records the real
caller. Discovery filters include the multisig-owned resources for every signer.

## Discovery and AccountIndex

A successful ownership transfer probes its new owner. First inspection of an
already-owned asset through `GET /api/v2/owners/:address` can also discover it.
A valid on-chain getOwners() set is persisted and the normal system-signer
account registration job is enqueued in the same database transaction.

Registration is restricted to verified owners of real catalog assets. River
uniqueness coalesces repeated discovery, and the worker checks AccountIndex's
contains(address) before spending gas on add(address). This preserves inactive
entries and avoids duplicate additions.

The normal AddressAdded path puts the multisig into eth-tracker's watch set.
AccountIndex enumeration and persistent tracker state handle restart/recovery;
no separate manual bootstrap is required for normal multisig onboarding.
cmd/reconcile-ownership remains available for repair.

## Capabilities and public display

Recognition is based on a valid, nonempty, unique getOwners() address list,
not a VERSION() allowlist. Empty-code and EIP-7702 delegated accounts keep the
ordinary account path. getThreshold() is optional: unknown quorum is displayed
as unknown rather than fabricated, and is stored as NULL.

Both voucher and pool details publicly identify multisig ownership and display
the signer count, quorum when available, and a Safe dashboard link. Metadata
permissions use the same stored membership as the backend. Owner inspection can
refresh custom contracts that do not emit the standard events; an RPC outage
does not discard an existing persisted projection.

Custom implementations have partial support. getOwners() authorizes metadata;
Safe-style owner events provide automatic updates. Implementations with other
events need inspection/reconciliation to refresh membership. None of this
promises that their transaction hashing or signatures are Safe-compatible.

## Optional transaction proposals

On Gnosis, a paper-wallet or supported ECDSA connector may propose a standard
Safe transaction through clc-core's Safe Transaction Service proxy. A single
call targets its asset; batches use pinned MultiSendCallOnly addresses.
The proxy binds the signed-in sender, signature, Safe transaction hash and
owned asset calls. Its production API key stays in backend configuration.

Proposal submission always stops before execution, even at threshold one.
Other signers confirm and execute in Safe. Rejection and cancellation also
belong to Safe. CLC shows a read-only proposal list and an Open in Safe link;
it does not persist a duplicate transaction store or promise terminal statuses.
Refresh CLC after execution to reload asset ownership and balances.

Queueing is best effort. Missing STS, unsupported custom transaction interfaces,
passkey signing, or proposal errors leave metadata available and provide a
wallet/dashboard handoff. Passkey sessions may edit metadata when their account
address belongs to the owner set. Safe WebAuthn/Calibur transaction signatures,
Safe creation, modules, spending policies and in-app confirmation/execution are
outside this release.

## Deployment and QA

Keep VITE_SAFE_OWNERSHIP_ENABLED off in production until eth-tracker
v1.15.0-stable and clc-core with migration 062 are deployed there; staging and
previews (`[env.preview.vars]`) already run them and have it on. Configure the
existing AccountIndex and system writer as for user signup. STS configuration is optional and must not gate ownership or metadata.
See docs/OWNERSHIP_TRANSFER.md for the short end-to-end QA procedure.
