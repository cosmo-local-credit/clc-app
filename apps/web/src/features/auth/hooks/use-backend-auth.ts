import type { ProfileInput } from "@clc/core/features/signup/logic";
import { placeholderSignupEmail } from "@clc/core/features/wallet/paper-wallet";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { signMessage } from "wagmi/actions";

import {
  privateKeySigner,
  signInWithSiwe,
  signSiweMessage,
  type SiweRequest,
} from "@clc/api/features/auth/siwe";
import { isRetryableStorageError, type UploadedImage } from "@clc/api/features/images/client";
import { wagmiConfig } from "#/providers/web3-config";
import { authClient } from "#/lib/api/auth";
import { CHAIN_ID } from "#/lib/chain";
import { isStorageConfigured, storageClient } from "#/lib/api/storage";

export type BackendSignupInput = {
  profile: ProfileInput;
  privateKey: `0x${string}`;
  /** Required profile photo, chosen during onboarding and uploaded here. */
  avatarFile: File;
};

/**
 * Uploads the onboarding photo after signup has created a session.
 *
 * Called only once a session cookie exists, because the upload service takes a
 * clc-core token and this is the first point in onboarding where one can be
 * fetched. An upload failure stops onboarding so the required photo is never
 * silently dropped. Retrying signup signs in to the account just created.
 *
 * The upload id is generated per user action rather than derived from the file,
 * so two people uploading the same bytes get their own object. A transient
 * server or network failure gets one retry with that same id, making the retry
 * idempotent at storage.
 */
async function uploadOnboardingAvatar(file: File): Promise<string> {
  const { token } = await authClient.getStorageToken();
  const storage = storageClient();
  const input = {
    file,
    purpose: "profile.avatar" as const,
    uploadId: crypto.randomUUID().replaceAll("-", ""),
  };

  let uploaded: UploadedImage;
  try {
    uploaded = await storage.upload(input, token);
  } catch (error) {
    if (!isRetryableStorageError(error)) throw error;
    uploaded = await storage.upload(input, token);
  }
  return uploaded.url;
}

/** The origin the user sees in the signature prompt, plus the intent. */
function siweRequest(statement: string): SiweRequest {
  return {
    domain: window.location.host,
    uri: window.location.origin,
    chainId: CHAIN_ID,
    statement,
  };
}

export function useBackendSignup() {
  const { t } = useLingui();

  return useMutation({
    mutationFn: async ({ profile, privateKey, avatarFile }: BackendSignupInput) => {
      if (!avatarFile) throw new Error(t`Add a profile photo to continue.`);
      if (!isStorageConfigured) throw new Error(t`Photo uploads are unavailable right now.`);

      const signer = privateKeySigner(privateKey);
      const signed = await signSiweMessage(authClient, signer, siweRequest("Sign up for CLC App"));

      const email = profile.email.trim() || placeholderSignupEmail(signer.address);

      const result = await authClient.signupWithSiwe({
        ...signed,
        name: profile.name,
        email,
      });

      // signupWithSiwe only persists name + email (and sets the session cookie).
      // The remaining profile fields must be written through the authenticated
      // profile endpoint.
      //
      // On 409/alreadyRegistered the signup call does not issue a session, so we
      // SIWE-sign-in first — otherwise phone/country stay stale — then submit the
      // (possibly edited) profile.
      if (result.alreadyRegistered) {
        await signInWithSiwe(authClient, signer, siweRequest("Sign in to CLC App"));
      }

      // Only now is there a session to authorize an upload with.
      let avatarUrl: string;
      try {
        avatarUrl = await uploadOnboardingAvatar(avatarFile);
      } catch {
        throw new Error(t`Could not upload your photo. Please try again.`);
      }

      await authClient.submitProfile({
        name: profile.name,
        email,
        phone: profile.phone,
        country: profile.location.country,
        preferredCurrency: profile.preferredCurrency,
        bio: profile.bio,
        website: profile.website,
        locationName: profile.location.locationName,
        geoLat: profile.location.lat,
        geoLng: profile.location.lng,
        avatarUrl,
      });

      return result;
    },
  });
}

export type BackendPrivateKeySigninInput = {
  privateKey: `0x${string}`;
};

export function useBackendPrivateKeySignin() {
  return useMutation({
    mutationFn: ({ privateKey }: BackendPrivateKeySigninInput) =>
      signInWithSiwe(authClient, privateKeySigner(privateKey), siweRequest("Sign in to CLC App")),
  });
}

export function useBackendWalletSignin(
  address: `0x${string}` | undefined,
  chainId: number | undefined,
) {
  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      return signInWithSiwe(
        authClient,
        { address, signMessage: (message) => signMessage(wagmiConfig, { message }) },
        { ...siweRequest("Sign in to CLC App"), chainId: chainId ?? CHAIN_ID },
      );
    },
  });
}
