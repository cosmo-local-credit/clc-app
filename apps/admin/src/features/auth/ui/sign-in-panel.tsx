/**
 * Operator sign-in.
 *
 * Rendered inline by AuthBoundary wherever the operator landed, rather than on a
 * route of its own: the console has no public surface, so there is nothing to
 * redirect back from, and staying put means a bookmarked deep link survives
 * signing in.
 *
 * Credentials are the same ones apps/web accepts — a paper wallet (plain or
 * BIP38-encrypted), a raw private key, or a passkey. The role gate lives in
 * admin-session.ts, so a successful sign-in by a non-superadmin lands on the
 * "not authorized" screen instead of failing here.
 */

import { useState } from "react";
import { FiKey, FiLoader } from "react-icons/fi";
import { MdOutlineFingerprint } from "react-icons/md";

import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { decryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { useAdminPasskeySignin, useAdminPrivateKeySignin } from "../use-admin-signin";
import { isPasskeySupported } from "../webauthn-assertion";

/** A BIP38 payload needs a passphrase before it yields a key. */
type PendingDecryption = { encryptedKey: string };

export function SignInPanel() {
  const privateKeySignin = useAdminPrivateKeySignin();
  const passkeySignin = useAdminPasskeySignin();
  const [payload, setPayload] = useState("");
  const [pending, setPending] = useState<PendingDecryption | null>(null);
  const [passphrase, setPassphrase] = useState("");
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

  function handlePayloadSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = parsePaperWalletImportPayload(payload);
    if (parsed.type === "raw") {
      void signInWithKey(parsed.key);
      return;
    }
    if (parsed.type === "encrypted") {
      setPending({ encryptedKey: parsed.encryptedKey });
      setPayload("");
      return;
    }
    setError(parsed.error);
  }

  async function handleDecryptSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pending) return;

    setError(null);
    setDecrypting(true);
    try {
      // scrypt at the Sarafu parameters takes a noticeable moment on a desktop
      // CPU; the button reports it rather than appearing to do nothing.
      const key = await decryptPaperWalletPrivateKey(pending.encryptedKey, passphrase);
      setPassphrase("");
      setPending(null);
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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">CLC Admin</h1>
          <p className="text-muted-foreground text-sm">
            Sign in with your operator credentials. Console access requires a superadmin account.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 border border-border bg-card p-4">
          {pending ? (
            <form onSubmit={handleDecryptSubmit} className="space-y-3">
              <SectionHeading>Paper wallet password</SectionHeading>
              <p className="text-muted-foreground text-sm">
                This paper wallet is encrypted. Enter the password used to protect it.
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
              <div className="flex gap-2">
                <Button type="submit" disabled={!passphrase || busy}>
                  {decrypting ? <FiLoader className="animate-spin" /> : <FiKey />}
                  {decrypting ? "Decrypting..." : "Unlock and sign in"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPending(null);
                    setPassphrase("");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </form>
          ) : (
            <>
              {isPasskeySupported() ? (
                <div className="space-y-3">
                  <SectionHeading>Passkey</SectionHeading>
                  <Button className="w-full" disabled={busy} onClick={() => void handlePasskey()}>
                    {passkeySignin.isPending ? (
                      <FiLoader className="animate-spin" />
                    ) : (
                      <MdOutlineFingerprint />
                    )}
                    {passkeySignin.isPending ? "Waiting for passkey..." : "Continue with passkey"}
                  </Button>
                </div>
              ) : null}

              <form onSubmit={handlePayloadSubmit} className="space-y-3">
                <SectionHeading>Paper wallet or private key</SectionHeading>
                <Textarea
                  value={payload}
                  onChange={(event) => setPayload(event.target.value)}
                  placeholder="Private key, encrypted paper wallet, or a paper wallet link"
                  className="min-h-20 font-mono text-xs"
                  aria-label="Paper wallet or private key"
                  aria-invalid={!!error}
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={!payload.trim() || busy}
                >
                  {privateKeySignin.isPending ? <FiLoader className="animate-spin" /> : <FiKey />}
                  {privateKeySignin.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * Turns a sign-in failure into something an operator can act on.
 *
 * The three cases clc-core distinguishes need different responses: an
 * unregistered address is not an admin problem to solve here, an unapproved
 * account needs a superadmin, and a rejected signature usually means the wrong
 * key or a dismissed prompt.
 */
export function signinErrorMessage(error: unknown): string {
  if (error instanceof BackendApiError) {
    switch (error.kind) {
      case "not-found":
        return "That account is not registered with CLC. Sign up in the app first, then ask a superadmin to grant console access.";
      case "forbidden":
        return /reject/i.test(error.description)
          ? "This account has been rejected and cannot sign in."
          : "This account is still awaiting approval by a superadmin.";
      case "validation":
        return "The signature was rejected. Check that you pasted the right key, then try again.";
      default:
        return formatBackendApiError(error);
    }
  }

  // A dismissed passkey prompt is the common non-backend failure and reads as a
  // DOMException rather than anything backend-shaped.
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The passkey prompt was dismissed or timed out.";
  }

  return error instanceof Error ? error.message : "Sign-in failed.";
}
