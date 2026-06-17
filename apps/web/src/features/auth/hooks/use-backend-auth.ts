import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useMutation } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount } from "viem/accounts";
import { signMessage } from "wagmi/actions";

import { wagmiConfig } from "#/providers/web3-config";
import { getSiweNonce, signinWithSiwe, signupWithSiwe } from "../api/client";

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

      return signupWithSiwe({
        message,
        signature,
        name: profile.name,
        email:
          profile.email.trim() || `pending+${account.address.slice(2).toLowerCase()}@clc.local`,
      });
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
