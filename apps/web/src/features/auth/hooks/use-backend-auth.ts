import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useMutation } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount } from "viem/accounts";
import { signMessage } from "wagmi/actions";

import { wagmiConfig } from "#/providers/web3-config";
import { getSiweNonce, signinWithSiwe, signupWithSiwe, submitProfile } from "../api/client";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

export type BackendSignupInput = {
  profile: ProfileInput;
  privateKey: `0x${string}`;
};

export function useBackendSignup() {
  return useMutation({
    mutationFn: async ({ profile, privateKey }: BackendSignupInput) => {
      const account = privateKeyToAccount(privateKey);
      const nonce = await getSiweNonce();
      const message = createSiweMessage({
        domain: window.location.host,
        address: account.address,
        statement: "Sign up for CLC App",
        uri: window.location.origin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
      });
      const signature = await account.signMessage({ message });

      const email =
        profile.email.trim() || `pending+${account.address.slice(2).toLowerCase()}@clc.local`;

      const result = await signupWithSiwe({
        message,
        signature,
        name: profile.name,
        email,
      });

      // signupWithSiwe only persists name + email (and sets the session
      // cookie). The remaining profile fields (phone, country) must be written
      // through the authenticated profile endpoint, otherwise they are silently
      // dropped and downstream flows (MPESA/Pretium) see no linked phone.
      // Skipped for an already-registered address: no session cookie was
      // issued in that case, so the profile write would 401.
      if (!result.alreadyRegistered) {
        await submitProfile({
          name: profile.name,
          email,
          phone: profile.phone,
          country: profile.location.country,
        });
      }

      return result;
    },
  });
}

export type BackendPrivateKeySigninInput = {
  privateKey: `0x${string}`;
};

export function useBackendPrivateKeySignin() {
  return useMutation({
    mutationFn: async ({ privateKey }: BackendPrivateKeySigninInput) => {
      const account = privateKeyToAccount(privateKey);
      const nonce = await getSiweNonce();
      const message = createSiweMessage({
        domain: window.location.host,
        address: account.address,
        statement: "Sign in to CLC App",
        uri: window.location.origin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
      });
      const signature = await account.signMessage({ message });
      return signinWithSiwe({ message, signature });
    },
  });
}

export function useBackendWalletSignin(
  address: `0x${string}` | undefined,
  chainId: number | undefined,
) {
  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      const nonce = await getSiweNonce();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CLC App",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? CHAIN_ID,
        nonce,
      });
      const signature = await signMessage(wagmiConfig, { message });
      return signinWithSiwe({ message, signature });
    },
  });
}
