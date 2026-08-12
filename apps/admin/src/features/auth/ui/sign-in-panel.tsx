/**
 * Operator sign-in.
 *
 * Rendered inline by AuthBoundary wherever the operator landed, rather than on a
 * route of its own: the console has no public surface, so there is nothing to
 * redirect back from, and staying put means a bookmarked deep link survives
 * signing in.
 *
 * Layout follows shadcn's login-03 block — centered single column, brand mark
 * above the panel, centered heading, providers first, separator, then the
 * fallback credential, footer note below. The treatment is Lyra rather than
 * shadcn's default: the container is `border border-border bg-card` rather than
 * `<Card>`, which admin reserves for sections inside the shell, and corners stay
 * square because admin zeroes the radius tokens outright.
 *
 * Credential order matches how operators actually hold their keys. A paper wallet
 * is a printed QR code, so uploading or scanning it is the path; typing a raw
 * private key is the escape hatch behind "Advanced", not the headline. This
 * mirrors apps/web, where the scanner is primary and the key field sits under
 * "Advanced options".
 *
 * The role gate lives in admin-session.ts, so a successful sign-in by a
 * non-superadmin lands on the "not authorized" screen instead of failing here.
 */

import { type FormEvent, useState } from "react";
import { FiChevronDown, FiKey, FiLoader, FiShield } from "react-icons/fi";
import { MdOutlineFingerprint } from "react-icons/md";

import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { decryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { usePasskeySupport } from "../passkey-support";
import { useAdminPasskeySignin, useAdminPrivateKeySignin } from "../use-admin-signin";
import { PaperWalletReader } from "./paper-wallet-reader";

export function SignInPanel() {
  const privateKeySignin = useAdminPrivateKeySignin();
  const passkeySignin = useAdminPasskeySignin();
  const passkey = usePasskeySupport();

  const [encryptedKey, setEncryptedKey] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pastedKey, setPastedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const busy = privateKeySignin.isPending || passkeySignin.isPending || decrypting;

  async function signInWithKey(key: `0x${string}`) {
    setError(null);
    try {
      await privateKeySignin.mutateAsync(key);
    } catch (err) {
      setError(signinErrorMessage(err));
    }
  }

  /** Shared by the reader and the advanced field — both yield the same payload. */
  function consumePayload(raw: string) {
    setError(null);
    const parsed = parsePaperWalletImportPayload(raw);
    if (parsed.type === "raw") {
      void signInWithKey(parsed.key);
      return;
    }
    if (parsed.type === "encrypted") {
      setEncryptedKey(parsed.encryptedKey);
      setPastedKey("");
      return;
    }
    setError(parsed.error);
  }

  async function handleDecrypt(event: FormEvent) {
    event.preventDefault();
    if (!encryptedKey) return;

    setError(null);
    setDecrypting(true);
    try {
      // scrypt at the Sarafu parameters takes a noticeable moment even on a
      // desktop CPU, so the button says what it is doing.
      const key = await decryptPaperWalletPrivateKey(encryptedKey, passphrase);
      setPassphrase("");
      setEncryptedKey(null);
      await signInWithKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decrypt this paper wallet.");
    } finally {
      setDecrypting(false);
    }
  }

  async function handlePasskey() {
    setError(null);
    try {
      await passkeySignin.mutateAsync();
    } catch (err) {
      setError(signinErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center">
          <div className="flex size-6 items-center justify-center bg-primary text-primary-foreground">
            <FiShield className="size-3.5" />
          </div>
          <span className="font-heading font-semibold tracking-tight">CLC Admin</span>
        </div>

        <div className="border border-border bg-card">
          <div className="space-y-1 border-b border-border p-6 text-center">
            <h1 className="font-heading text-lg font-semibold tracking-tight">Operator sign-in</h1>
            <p className="text-muted-foreground text-sm">
              Use the credentials you sign into CLC with.
            </p>
          </div>

          <div className="space-y-4 p-6">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {encryptedKey ? (
              <form onSubmit={(event) => void handleDecrypt(event)} className="space-y-3">
                <SectionLabel>Paper wallet password</SectionLabel>
                <p className="text-muted-foreground text-sm">
                  This wallet is password-protected. Enter the password used when it was created.
                </p>
                <Input
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  aria-label="Paper wallet password"
                  aria-invalid={!!error}
                />
                <Button type="submit" className="w-full" disabled={!passphrase || busy}>
                  {decrypting ? <FiLoader className="animate-spin" /> : <FiKey />}
                  {decrypting ? "Unlocking..." : "Unlock and sign in"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    setEncryptedKey(null);
                    setPassphrase("");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </form>
            ) : (
              <>
                {passkey.status === "available" ? (
                  <Button className="w-full" disabled={busy} onClick={() => void handlePasskey()}>
                    {passkeySignin.isPending ? (
                      <FiLoader className="animate-spin" />
                    ) : (
                      <MdOutlineFingerprint />
                    )}
                    {passkeySignin.isPending
                      ? "Waiting for passkey..."
                      : `Continue with ${passkey.label}`}
                  </Button>
                ) : null}

                {passkey.status === "unsupported" ? (
                  <p className="border border-border bg-muted p-3 text-muted-foreground text-xs">
                    {passkey.reason}
                  </p>
                ) : null}

                {passkey.status === "available" ? (
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
                      or paper wallet
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : (
                  <SectionLabel>Paper wallet</SectionLabel>
                )}

                <PaperWalletReader onDecoded={consumePayload} disabled={busy} />

                {privateKeySignin.isPending ? (
                  <p className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <FiLoader className="size-4 animate-spin" />
                    Signing in...
                  </p>
                ) : null}

                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
                    aria-expanded={showAdvanced}
                    onClick={() => {
                      setShowAdvanced((open) => !open);
                      setError(null);
                    }}
                  >
                    Advanced
                    <FiChevronDown
                      className={`size-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showAdvanced ? (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        consumePayload(pastedKey);
                      }}
                    >
                      <SectionLabel>Private key</SectionLabel>
                      <p className="text-muted-foreground text-xs">
                        Paste a private key, an encrypted wallet payload, or a paper wallet link.
                      </p>
                      <Textarea
                        value={pastedKey}
                        onChange={(event) => setPastedKey(event.target.value)}
                        placeholder="0x..."
                        className="min-h-16 font-mono text-xs"
                        aria-label="Private key"
                        aria-invalid={!!error}
                        spellCheck={false}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full"
                        disabled={!pastedKey.trim() || busy}
                      >
                        <FiKey />
                        Sign in with private key
                      </Button>
                    </form>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-muted-foreground text-xs">
          Console access requires a superadmin account. Signing in with any other account will say
          so rather than fail silently.
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * Turns a sign-in failure into something an operator can act on.
 *
 * The cases clc-core distinguishes need different responses: an unregistered
 * address is not a problem to solve in this console, an unapproved account needs
 * a superadmin, and a rejected signature usually means the wrong wallet.
 */
export function signinErrorMessage(error: unknown): string {
  if (error instanceof BackendApiError) {
    switch (error.kind) {
      case "not-found":
        return "That account is not registered with CLC. Sign up in the app first, then ask a superadmin for console access.";
      case "forbidden":
        return /reject/i.test(error.description)
          ? "This account has been rejected and cannot sign in."
          : "This account is still awaiting approval by a superadmin.";
      case "validation":
        return "The signature was rejected. Check that this is the right wallet, then try again.";
      default:
        return formatBackendApiError(error);
    }
  }

  // A dismissed passkey prompt is the common non-backend failure, and it arrives
  // as a DOMException rather than anything backend-shaped.
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The passkey prompt was dismissed or timed out.";
  }

  return error instanceof Error ? error.message : "Sign-in failed.";
}
