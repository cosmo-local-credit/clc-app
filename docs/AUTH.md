# Authentication Flow

Client-side authentication and wallet connection flows.

## Current Auth Model

The app treats wallet connection as the primary gate:

- `/` renders `HomePage` when `useAccount()` is connected.
- `/` renders `LandingPage` when disconnected.
- `/onboarding` renders `OnboardingFlow`.
- `WagmiProvider` is configured with only two connectors:
  - `private-key`, backed by a stored paper-wallet key.
  - `calibur-webauthn`, backed by a stored WebAuthn credential.

SIWE is separate from wallet connection:

- `LandingPage` calls `useSiweAuth().authenticate()` after wagmi reports
  `isConnected`.
- The SIWE JWT is stored in `sessionStorage` under `clc_auth_token`.
- `HomePage` currently only requires wallet connection, not a SIWE token.
- On sign-out, `HomePage` clears the SIWE token and calls wagmi disconnect.

## Storage

| Data                        | Storage          | Key                | Written by                | Cleared by                                              |
| --------------------------- | ---------------- | ------------------ | ------------------------- | ------------------------------------------------------- |
| Paper-wallet private key    | `localStorage`   | `clc_pk_raw`       | `storePrivateKey`         | `clearPrivateKey`, private-key connector disconnect     |
| Paper-wallet connected flag | `localStorage`   | `clc_pk_connected` | `storePrivateKey`         | `clearPrivateKey`                                       |
| Paper-wallet address        | `localStorage`   | `clc_pk_address`   | `storePrivateKey`         | `clearPrivateKey`                                       |
| WebAuthn credential         | `localStorage`   | `clc_webauthn`     | `storeWebAuthnCredential` | `clearWebAuthnCredential`, Calibur connector disconnect |
| SIWE JWT                    | `sessionStorage` | `clc_auth_token`   | `setAuthToken`            | `clearAuthToken`, browser session end                   |

## Overall UI Flow

```mermaid
flowchart TD
  App["App root"] --> Web3["WagmiProvider reconnectOnMount"]
  Web3 --> ScanUrl["useScanUrlImport checks ?w=<key> once"]
  ScanUrl --> Index["/ route: IndexPage"]

  Index --> AccountState{"wagmi status"}
  AccountState -->|"connecting / reconnecting"| Blank["Render null"]
  AccountState -->|"connected"| Home["HomePage"]
  AccountState -->|"disconnected"| Landing["LandingPage"]

  Landing --> Create["Create an account"]
  Create --> Onboarding["/onboarding"]
  Landing --> PasskeySignin{"Passkey platform available?"}
  PasskeySignin -->|"yes"| Recover["Continue with Google / Apple ID"]
  PasskeySignin -->|"no"| NoPasskeyButton["No passkey button"]
  Landing --> Scan["Continue with Paper Wallet"]
  Landing --> Advanced["Advanced options"]
  Advanced --> ManualPk["Private key form"]

  Onboarding --> Profile["Profile form"]
  Profile --> Wallet["Wallet step generates paper wallet"]
  Wallet --> LinkPasskey{"Passkey platform available?"}
  LinkPasskey -->|"yes"| Upgrade["Link wallet to passkey"]
  LinkPasskey -->|"no"| PaperOnly["Continue to wallet"]
  Wallet --> PaperOnly

  Home --> SignOut["Sign out"]
  SignOut --> ClearToken["clearAuthToken"]
  ClearToken --> Disconnect["wagmi disconnect"]
  Disconnect --> Landing
```

## Onboarding Flow

Onboarding is two client-side steps:

1. `OnboardingProfileForm` validates profile input.
2. `OnboardingWalletStep` generates a new private key and presents it as a
   paper wallet.

The current profile data is not persisted during the active onboarding path.
`OnboardingProfileForm` logs profile data and passes it to the wallet step.
`OnboardingWalletStep` logs it again when continuing with the paper wallet.
`submitSignupProfile` exists, but the current onboarding UI does not call it.

```mermaid
flowchart TD
  Start["/onboarding"] --> Profile["Profile form"]
  Profile --> Validate{"profileSchema valid?"}
  Validate -->|"no"| FieldErrors["Show field errors"]
  Validate -->|"yes"| WalletStep["Wallet step"]

  WalletStep --> Generate["generatePrivateKey once via ref"]
  Generate --> Card["Show paper wallet QR URL"]
  Card --> SaveAck{"User checks saved-key acknowledgement?"}
  SaveAck -->|"no"| ContinueDisabled["Continue disabled"]
  SaveAck -->|"yes"| ContinueEnabled["Continue enabled"]

  ContinueEnabled --> PaperConnect["Continue with paper wallet only"]
  PaperConnect --> StorePk["storePrivateKey(pk)"]
  StorePk --> WagmiPk["wagmi connect(pkConnector)"]
  WagmiPk -->|"success"| Done["navigate /"]
  WagmiPk -->|"failure"| ClearPk["clearPrivateKey + show error"]

  Card --> PasskeyAvailable{"Passkey platform available?"}
  PasskeyAvailable -->|"yes"| Link["Link wallet to Google / Apple ID passkey"]
  PasskeyAvailable -->|"no"| NoLink["Hide link button"]
  Link --> UpgradeSequence["Calibur upgrade/link sequence"]
  UpgradeSequence -->|"success"| ConnectCalibur["wagmi connect(caliburConnector)"]
  ConnectCalibur -->|"success"| Done
  ConnectCalibur -->|"failure"| LinkConnectError["Show passkey linked but connect failed"]
```

### Onboarding: Paper Wallet Only

```mermaid
sequenceDiagram
  actor User
  participant UI as OnboardingWalletStep
  participant PK as privateKey storage
  participant Wagmi
  participant Route as Router

  User->>UI: Check "I have saved this key"
  User->>UI: Continue with paper wallet only
  UI->>PK: storePrivateKey(pk)
  UI->>Wagmi: connect(wagmiConfig, pkConnector)
  alt connect succeeds
    UI->>Route: navigate("/", replace=true)
  else connect fails
    UI->>PK: clearPrivateKey()
    UI-->>User: Show connection error
  end
```

### Onboarding: Link Paper Wallet To Passkey

This path upgrades the generated paper-wallet key into a Calibur smart account
and stores the WebAuthn credential locally.

```mermaid
sequenceDiagram
  actor User
  participant UI as OnboardingWalletStep
  participant Hook as useCaliburFromPk
  participant Relayer
  participant WebAuthn as Browser WebAuthn
  participant Celo as Celo RPC
  participant Store as WebAuthn storage
  participant Wagmi
  participant Route as Router

  User->>UI: Link wallet to passkey
  UI->>Hook: upgradeAndLink.mutate()
  Hook->>Hook: assertWebAuthnSupported("create")
  Hook->>Relayer: GET /nonce/:address
  Hook->>Hook: sign EIP-7702 authorization with paper key
  Hook->>WebAuthn: navigator.credentials.create(...)
  alt user cancels or browser cannot create
    Hook-->>UI: step=error, error message
  else credential created
    Hook->>Hook: extract P-256 public key, compute keyHash
    Hook->>Relayer: GET /calibur-nonce/:address
    Hook->>Relayer: GET /health
    Hook->>Hook: encode register calldata and signed batch
    Hook->>Relayer: POST /relay with secp256k1 signature, EIP-7702 auth, credential public key
    Relayer-->>Hook: txHash
    Hook->>Celo: waitForTransactionReceipt(txHash, 120s)
    alt receipt success
      Hook->>Store: storeWebAuthnCredential(...)
      Hook-->>UI: step=done
      UI->>Wagmi: connect(caliburConnector)
      alt wagmi connect succeeds
        UI->>Route: navigate("/", replace=true)
      else wagmi connect fails
        UI-->>User: Show "Passkey linked, but wallet connection failed"
      end
    else receipt failure or timeout
      Hook-->>UI: step=error, error message
    end
  end
```

## Sign-In Flow

The landing page exposes three sign-in paths:

- Passkey recovery, when platform passkeys are available.
- Paper-wallet QR scan.
- Manual private-key entry under advanced options.

```mermaid
flowchart TD
  Landing["LandingPage"] --> Passkey{"Passkey platform available?"}
  Passkey -->|"yes"| Recover["Continue with Google / Apple ID"]
  Passkey -->|"no"| HideRecover["Hide passkey CTA"]

  Landing --> PaperScan["Continue with Paper Wallet"]
  Landing --> Advanced["Advanced options"]
  Advanced --> PrivateKey["Private key"]

  Recover --> RecoverySequence["WebAuthn recovery sequence"]
  PaperScan --> Scanner["PaperWalletScanner"]
  Scanner --> NormalizeScanned{"normalizePrivateKey(raw)"}
  NormalizeScanned -->|"invalid"| ScanError["Show invalid QR error"]
  NormalizeScanned -->|"valid"| ConnectPk["store key + connect pkConnector"]

  PrivateKey --> NormalizeManual{"normalizePrivateKey(input)"}
  NormalizeManual -->|"invalid"| PkError["Show validation error"]
  NormalizeManual -->|"valid"| ConnectPk

  ConnectPk -->|"success"| Connected["wagmi connected"]
  ConnectPk -->|"failure"| ClearAndError["clearPrivateKey + show error"]
  Connected --> Siwe["SIWE authenticate effect"]
```

### Sign-In: Passkey Recovery

```mermaid
sequenceDiagram
  actor User
  participant UI as LandingPage
  participant Hook as useCaliburRecovery
  participant Relayer
  participant WebAuthn as Browser WebAuthn
  participant Store as WebAuthn storage
  participant Wagmi

  User->>UI: Continue with Google / Apple ID
  UI->>Hook: recover.mutate()
  Hook->>Relayer: GET /webauthn/challenge
  Relayer-->>Hook: challenge
  Hook->>WebAuthn: navigator.credentials.get({ rpId, challenge })
  alt user cancels or browser fails
    Hook-->>UI: outcome=failed, error message
  else assertion returned
    Hook->>Relayer: POST /webauthn/recover
    alt relayer returns 404
      Hook-->>UI: outcome=not_found
      UI-->>User: Show "No passkey found" with create-account and retry actions
    else relayer returns verification/server error
      Hook-->>UI: outcome=failed, error message
    else relayer returns credential metadata
      Hook->>Store: storeWebAuthnCredential(...)
      Hook-->>UI: step=done, outcome=recovered
      UI->>Wagmi: connect(caliburConnector)
    end
  end
```

### Sign-In: Paper Wallet QR Or Manual Private Key

```mermaid
sequenceDiagram
  actor User
  participant UI as LandingPage
  participant Normalize as normalizePrivateKey
  participant PK as privateKey storage
  participant Wagmi

  alt QR scan
    User->>UI: Scan paper wallet QR
    UI->>Normalize: normalizePrivateKey(raw QR value)
  else manual entry
    User->>UI: Submit private key
    UI->>Normalize: normalizePrivateKey(input)
  end

  alt invalid key
    Normalize-->>UI: ok=false, error
    UI-->>User: Show error
  else valid key
    Normalize-->>UI: ok=true, key
    UI->>PK: storePrivateKey(key)
    UI->>Wagmi: connect(wagmiConfig, pkConnector)
    alt connect succeeds
      UI->>UI: hide scanner/form and clear input
    else connect fails
      UI->>PK: clearPrivateKey()
      UI-->>User: Show connection error
    end
  end
```

### SIWE After Connection

SIWE currently runs only from `LandingPage`. If the user lands on `/` already
connected after wagmi reconnects and `IndexPage` renders `HomePage`, this
component-level SIWE effect does not run.

```mermaid
sequenceDiagram
  participant UI as LandingPage
  participant Wagmi
  participant Auth as useSiweAuth
  participant API as Application API
  participant Session as sessionStorage

  Wagmi-->>UI: isConnected=true
  UI->>Auth: authenticate()
  Auth->>Session: getAuthToken()
  alt token exists
    Auth-->>UI: return cached token
  else no token
    Auth->>API: POST /auth/siwe/nonce
    API-->>Auth: nonce
    Auth->>Auth: build SiweMessage(domain, address, uri, chainId, nonce)
    Auth->>Wagmi: signMessage(wagmiConfig, message)
    Wagmi-->>Auth: signature
    Auth->>API: POST /auth/siwe/verify
    API-->>Auth: token
    Auth->>Session: setAuthToken(token)
  end
```

## Paper-Wallet URL Import

Every page under the root route runs `useScanUrlImport()` once on mount. It
looks for `?w=<key>`, strips the query parameter, validates the key, and then
either connects or asks for confirmation.

```mermaid
flowchart TD
  Mount["AppInner mount"] --> Query{"URL has ?w="}
  Query -->|"no"| Done["No action"]
  Query -->|"yes"| Strip["history.replaceState(pathname)"]
  Strip --> Normalize{"normalizePrivateKey(w)"}
  Normalize -->|"invalid"| Ignore["Ignore after stripping URL"]
  Normalize -->|"valid"| Connected{"wagmi getAccount().isConnected"}
  Connected -->|"no"| Store["storePrivateKey(key)"]
  Store --> Connect["connect(pkConnector)"]
  Connect -->|"failure"| Clear["clearPrivateKey()"]
  Connect -->|"success"| Done
  Connected -->|"yes"| Pending["set pendingKey"]
  Pending --> Dialog["Switch wallet dialog"]
  Dialog --> Cancel["Cancel / close clears pendingKey"]
  Dialog --> Confirm["Switch wallet"]
  Confirm --> Snapshot["Save previous private key and WebAuthn credential"]
  Snapshot --> StorePending["storePrivateKey(pendingKey)"]
  StorePending --> ConnectPending["connect(pkConnector)"]
  ConnectPending -->|"success"| ClearWebAuthn["clearWebAuthnCredential + clear pendingKey"]
  ConnectPending -->|"failure"| Restore["restore previous private key and WebAuthn credential"]
```

## Connector Behavior

### Private-Key Connector

The `private-key` connector reads the stored key from `localStorage` and derives
the account address with `privateKeyToAccount`.

Supported provider methods:

- `eth_accounts`
- `eth_requestAccounts`
- `eth_chainId`
- `personal_sign`
- `eth_signTypedData_v4`
- `eth_sendTransaction`
- fallback to the viem wallet client request

Explicitly unsupported:

- `eth_sign`

Connect fails if no key is stored. Disconnect clears the private-key storage.

### Calibur WebAuthn Connector

The `calibur-webauthn` connector reads a stored WebAuthn credential from
`localStorage`.

Supported provider methods:

- `eth_accounts`
- `eth_requestAccounts`
- `eth_chainId`
- `eth_sendTransaction`

Unsupported signing methods:

- `personal_sign`
- `eth_sign`
- `eth_signTypedData_v4`

Transaction sending calls `sendCaliburTransaction`, which:

1. Reads the stored credential.
2. Fetches relayer health and Calibur nonce.
3. Builds an EIP-712 digest for the batch.
4. Prompts WebAuthn with the digest as the challenge.
5. Encodes the WebAuthn signature.
6. Relays the transaction through `POST /relay`.

Connect fails if no credential is stored or the stored credential is marked
`stale`. Disconnect clears the WebAuthn credential.

## Edge Cases

### Platform And Browser Support

| Scenario                                                | Current behavior                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Browser has no platform passkey support                 | Landing page hides the passkey sign-in button; onboarding hides the link-passkey button. |
| Browser supports passkeys but WebAuthn create/get fails | Hook sets `step=error`; UI shows the error message.                                      |
| Passkey create is cancelled                             | Treated as an error: `Passkey creation cancelled`.                                       |
| Passkey assertion is cancelled                          | Treated as an error: `WebAuthn assertion cancelled`.                                     |
| `VITE_RELYING_PARTY_ID` is a URL                        | `resolveRelyingPartyId` normalizes it to the hostname.                                   |
| No relying-party env and no browser hostname            | Falls back to `localhost`.                                                               |

### Onboarding

| Scenario                                                      | Current behavior                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Profile is invalid                                            | Field-level validation errors prevent advancing to wallet step.                              |
| User goes back from wallet step                               | Returns to profile step; generated key is discarded when the wallet step unmounts.           |
| User does not acknowledge saving the paper wallet             | Continue button remains disabled.                                                            |
| Download card fails                                           | Shows `Download failed. Try a screenshot instead.`                                           |
| Paper-wallet connection fails during onboarding               | Clears private-key storage and shows the error.                                              |
| Passkey upgrade relayer call fails                            | `useCaliburFromPk` sets `step=error` and displays the error.                                 |
| Passkey registration transaction fails on-chain               | Throws `Passkey registration transaction failed on-chain`.                                   |
| Passkey registration succeeds but wagmi Calibur connect fails | WebAuthn credential remains stored; UI shows `Passkey linked, but wallet connection failed.` |
| User links passkey successfully                               | Stores WebAuthn credential and navigates home after Calibur connector connects.              |

### Sign-In

| Scenario                                           | Current behavior                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Passkey recovery returns 404 from relayer          | UI shows `No passkey found`, with create-account and retry actions.               |
| Passkey recovery returns verification/server error | UI shows relayer description or generic recovery error.                           |
| Passkey recovery succeeds                          | Stores WebAuthn credential and connects Calibur connector.                        |
| QR code has no valid private key                   | UI shows `This QR code does not contain a valid private key.`                     |
| Manual private key is blank or malformed           | UI shows validation error from `normalizePrivateKey`.                             |
| Private-key connect fails                          | Clears private-key storage and shows the connection error.                        |
| SIWE nonce/sign/verify fails                       | Error is caught in `LandingPage` and logged to console; wallet remains connected. |
| SIWE token already exists in session storage       | `authenticate()` returns cached token without signing.                            |

### Paper-Wallet URL Import

| Scenario                                      | Current behavior                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| URL has no `?w=`                              | No action.                                                                                      |
| URL has invalid `?w=`                         | Query param is stripped, then ignored.                                                          |
| URL has valid `?w=` while disconnected        | Stores key and attempts `pkConnector` connect silently.                                         |
| Silent URL connect fails                      | Clears private-key storage.                                                                     |
| URL has valid `?w=` while already connected   | Opens switch-wallet dialog with derived address.                                                |
| User cancels switch dialog                    | Clears pending key only. Existing wallet remains connected.                                     |
| User confirms switch and new connect succeeds | Stores new private key, connects `pkConnector`, clears WebAuthn credential, clears pending key. |
| User confirms switch and new connect fails    | Restores previous private key and previous WebAuthn credential if they existed.                 |

### Disconnect And Reconnect

| Scenario                                | Current behavior                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| User signs out from `HomePage`          | Clears SIWE session token and calls wagmi `disconnectAsync()`.                     |
| Disconnecting private-key connector     | Clears private-key localStorage keys.                                              |
| Disconnecting Calibur connector         | Clears WebAuthn credential localStorage key.                                       |
| Wagmi reconnects on mount               | `IndexPage` may render `HomePage` directly when connected.                         |
| Wagmi reconnects directly to `HomePage` | `LandingPage` SIWE effect does not run, so SIWE may not be refreshed in that path. |

## Known Refinement Points

Gaps and sharp edges in the current implementation:

- Profile persistence is not wired into the active onboarding flow.
  `submitSignupProfile` exists but is unused by `OnboardingFlow`.
- SIWE is currently opportunistic and tied to `LandingPage`, not to the global
  connected state. A reconnect path can reach `HomePage` without re-running
  SIWE.
- A successful passkey link stores the WebAuthn credential before the follow-up
  wagmi Calibur connect succeeds. If that connect fails, the credential remains
  available for retry.
- Paper-wallet URL import silently connects when disconnected. Opening a valid
  `?w=` URL mutates wallet storage immediately.
- Switching to a paper wallet explicitly clears the WebAuthn credential on
  success, making the paper-wallet key the active local auth method.
- WebAuthn credentials can be marked stale, but no active flow in the current
  UI calls `markWebAuthnStale`.
