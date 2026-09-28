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
 * fallback credential. The treatment is Lyra rather than shadcn's default: the
 * container is `border border-border bg-card` rather than `<Card>`, which admin
 * reserves for sections inside the shell, and corners stay square because admin
 * zeroes the radius tokens outright.
 *
 * Credential order matches how operators actually hold their keys. A paper wallet
 * is a printed QR code, so uploading or scanning it is the path; typing a raw
 * private key is the escape hatch behind "Advanced", not the headline. This
 * mirrors apps/web, where the scanner is primary and the key field sits under
 * "Advanced options".
 *
 * The role gate lives in admin-session.ts. A session that lacks the role, or a
 * check that failed, brings the operator here with a `notice` rather than to a
 * dead-end screen — signing in with the right wallet is the recovery, and it
 * replaces the cookie in place.
 */

import { type FormEvent, useState } from "react";
import { FaChrome, FaSafari } from "react-icons/fa";
import { FiChevronDown, FiKey, FiLoader } from "react-icons/fi";
import { MdOutlineFingerprint } from "react-icons/md";

import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { decryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { SectionLabel } from "#/components/admin/section-heading";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { useAdminSignOut } from "../admin-session";
import { type PasskeyUnsupportedReason, usePasskeySupport } from "../passkey-support";
import { useAdminPasskeySignin, useAdminPrivateKeySignin } from "../use-admin-signin";
import { PaperWalletReader } from "./paper-wallet-reader";
import { BRAND_ICON_BASE } from "#/lib/brand";

/**
 * Why the operator is looking at sign-in when they did not ask for it — a session
 * that lacks the role, or a check that failed.
 */
export type SignInNotice = {
  title: string;
  description: string;
  /** True when a session cookie is still set, so signing out is worth offering. */
  signedIn?: boolean;
};

export function SignInPanel({ notice }: { notice?: SignInNotice }) {
  const privateKeySignin = useAdminPrivateKeySignin();
  const passkeySignin = useAdminPasskeySignin();
  const passkey = usePasskeySupport();
  const signOut = useAdminSignOut();

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
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center">
          {/* Same per-brand mark the favicon uses — green on prod, blue on staging. */}
          <img src={`${BRAND_ICON_BASE}/logo.svg`} alt="" className="size-6" />
          <span className="font-heading font-semibold tracking-tight">CLC Admin</span>
        </div>

        {notice ? (
          <Alert variant="destructive">
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>{notice.description}</AlertDescription>
            {notice.signedIn ? (
              <AlertAction>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={signOut.isPending}
                  onClick={() => signOut.mutate()}
                >
                  {signOut.isPending ? "Signing out..." : "Sign out"}
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        ) : null}

        <div className="border-border bg-card border">
          <div className="border-border border-b p-6 text-center">
            <h1 className="font-heading text-lg font-semibold tracking-tight">Sign in</h1>
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
                <SectionLabel>Wallet password</SectionLabel>
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
                  <PasskeyUnavailable reason={passkey.reason} />
                ) : null}

                {passkey.status === "available" ? (
                  <div className="flex items-center gap-3">
                    <span className="bg-border h-px flex-1" />
                    <span className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
                      or paper wallet
                    </span>
                    <span className="bg-border h-px flex-1" />
                  </div>
                ) : (
                  <SectionLabel>Paper wallet</SectionLabel>
                )}

                <PaperWalletReader onDecoded={consumePayload} disabled={busy} />

                {privateKeySignin.isPending ? (
                  <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                    <FiLoader className="size-4 animate-spin" />
                    Signing in...
                  </p>
                ) : null}

                <div className="border-border border-t pt-3">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 text-xs underline-offset-4 hover:underline"
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
                      <Textarea
                        value={pastedKey}
                        onChange={(event) => setPastedKey(event.target.value)}
                        // Covers all three accepted forms without a paragraph
                        // explaining them.
                        placeholder="0x…, 6P…, or a wallet link"
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
      </div>
    </div>
  );
}

/**
 * Why the passkey button is absent.
 *
 * The common case — a browser that holds no CLC passkey — says so with the two
 * browser marks rather than a sentence naming them. The other cases are genuinely
 * different problems and get their own short line.
 */
function PasskeyUnavailable({ reason }: { reason: PasskeyUnsupportedReason }) {
  if (reason === "insecure-context" || reason === "no-webauthn") {
    return (
      <p className="border-border bg-muted text-muted-foreground border p-3 text-xs">
        {reason === "insecure-context"
          ? "Passkeys need https or localhost."
          : "No passkey support in this browser."}
      </p>
    );
  }

  return (
    <div className="border-border bg-muted flex items-center gap-2 border p-3">
      <FaChrome className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <FaSafari className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="text-muted-foreground text-xs">
        {reason === "wrong-browser"
          ? "Passkey needs Chrome or Safari"
          : "No passkey on this device"}
      </span>
    </div>
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
