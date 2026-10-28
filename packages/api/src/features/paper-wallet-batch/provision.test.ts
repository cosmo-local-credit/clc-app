import { EMPTY_PAPER_WALLET_RECIPIENT } from "@clc/core/features/paper-wallet-batch/logic";
import { describe, expect, it, vi } from "vite-plus/test";
import { privateKeyToAccount } from "viem/accounts";

import { BackendApiError } from "../../client/errors";
import type { AdminClient } from "../admin/client";
import type { AuthClient } from "../auth/client";
import { provisionPaperWallet } from "./provision";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = privateKeyToAccount(KEY).address;
const SIWE = { domain: "admin.test", uri: "https://admin.test", chainId: 100, statement: "s" };

function clients() {
  const auth = {
    getSiweNonce: vi.fn().mockResolvedValue("abcdefgh12345678"),
    signupWithSiwe: vi.fn().mockResolvedValue({ userId: 1, status: "APPROVED", role: "USER" }),
  };
  const admin = { updateUserProfile: vi.fn().mockResolvedValue({}) };
  return {
    auth,
    admin,
    input: {
      auth: auth as unknown as AuthClient,
      admin: admin as unknown as AdminClient,
      privateKey: KEY as `0x${string}`,
      siwe: SIWE,
    },
  };
}

describe("provisionPaperWallet", () => {
  it("registers a blank wallet with placeholders, detached, and skips the profile step", async () => {
    const { auth, admin, input } = clients();
    const result = await provisionPaperWallet({
      ...input,
      recipient: EMPTY_PAPER_WALLET_RECIPIENT,
    });

    expect(result).toEqual({ address: ADDRESS });
    const [payload, options] = auth.signupWithSiwe.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      name: "Sign-in card",
      email: `pending+${ADDRESS.slice(2).toLowerCase()}@clc.local`,
    });
    expect(payload.message).toContain(ADDRESS);
    expect(options).toEqual({ detached: true });
    expect(admin.updateUserProfile).not.toHaveBeenCalled();
  });

  it("writes phone, country and currency through the admin profile endpoint", async () => {
    const { admin, input } = clients();
    await provisionPaperWallet({
      ...input,
      recipient: {
        name: "Amina",
        email: "",
        phone: "+254712345678",
        country: "KE",
        currency: "KES",
      },
    });
    expect(admin.updateUserProfile).toHaveBeenCalledWith(ADDRESS, {
      name: "Amina",
      email: `pending+${ADDRESS.slice(2).toLowerCase()}@clc.local`,
      phone: "+254712345678",
      country: "KE",
      preferredCurrency: "KES",
    });
  });

  it("keeps the wallet when only the profile step fails", async () => {
    const { admin, input } = clients();
    admin.updateUserProfile.mockRejectedValue(new BackendApiError(409, "phone taken", "E18"));
    const result = await provisionPaperWallet({
      ...input,
      recipient: { ...EMPTY_PAPER_WALLET_RECIPIENT, phone: "+254712345678" },
    });
    expect(result).toEqual({
      address: ADDRESS,
      profileError: "Phone number already belongs to another account",
    });
  });

  it("fails the wallet when signup is refused", async () => {
    const { auth, input } = clients();
    auth.signupWithSiwe.mockRejectedValue(new BackendApiError(409, "email taken", "E17"));
    await expect(
      provisionPaperWallet({
        ...input,
        recipient: { ...EMPTY_PAPER_WALLET_RECIPIENT, email: "a@b.co" },
      }),
    ).rejects.toMatchObject({ code: "E17" });
  });
});
