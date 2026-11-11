/**
 * The account directory and the three operations clc-core exposes over it.
 *
 * The directory pages and searches at the backend, so no screen holds the whole
 * table. Every mutation answers with the updated row, which is written straight
 * into the cache: the row on screen changes at once instead of after a round
 * trip. Invalidation follows, so the server still reconciles.
 */

import { privateKeySigner, signSiweMessage } from "@clc/api/features/auth/siwe";
import { buildKeyRotationStatement } from "@clc/core/features/key-rotation/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { privateKeyToAccount } from "viem/accounts";

import type {
  AdminUser,
  AdminUserLimits,
  AdminUserPage,
  AdminUserParams,
  AdminUserProfile,
} from "@clc/api/features/admin/client";
import {
  adminKeys,
  adminUserQueryOptions,
  adminUsersQueryOptions,
} from "@clc/api/features/admin/queries";
import { accountRetirementKeys } from "@clc/api/features/account-retirement/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { clcApi } from "#/lib/api";
import { CHAIN_ID } from "#/lib/chain";

export function useAdminUsers(params: AdminUserParams) {
  return useQuery(adminUsersQueryOptions(clcApi.admin, params));
}

/** One account for the detail screen. Resolves to null for an address with no account. */
export function useAdminUser(address: string) {
  return useQuery(adminUserQueryOptions(clcApi.admin, address));
}

/**
 * Writes one account into every cached page and into its own entry.
 *
 * Rows are replaced in place, never moved or dropped. None of the three
 * mutations touches the columns `q` matches or the id the pages are ordered by,
 * so an approval cannot change which page an account belongs to — that is what
 * makes a blind sweep over the cached pages correct here. A mutation that edited
 * a name or an address would not have that property, and would need to reconcile
 * membership rather than map over it.
 */
function useWriteUserToCache() {
  const queryClient = useQueryClient();

  return (updated: AdminUser) => {
    // Matched case-insensitively: the backend answers with a checksummed
    // address, which need not match the casing the row was listed under.
    const isUpdated = (user: AdminUser) =>
      user.ethereumAddress.toLowerCase() === updated.ethereumAddress.toLowerCase();

    queryClient.setQueriesData<AdminUserPage>(
      { queryKey: [...adminKeys.all, "users", "page"] },
      (cached) =>
        cached
          ? { ...cached, users: cached.users.map((user) => (isUpdated(user) ? updated : user)) }
          : cached,
    );

    // Only if a detail screen has already asked for this account: returning
    // undefined leaves the cache alone rather than seeding an entry nothing is
    // watching.
    queryClient.setQueryData<AdminUser | null>(adminKeys.user(updated.ethereumAddress), (cached) =>
      cached === undefined ? undefined : updated,
    );

    void queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] });
  };
}

type ModerationInput = { address: string; reason?: string };

/**
 * Ban and unban each append a moderation event, so the history is invalidated
 * beside the row that the response already updates.
 */
function useWriteModeratedUser() {
  const writeUser = useWriteUserToCache();
  const queryClient = useQueryClient();

  return (user: AdminUser) => {
    writeUser(user);
    void queryClient.invalidateQueries({ queryKey: accountRetirementKeys.all });
  };
}

/** Unban, or approve a pending account. */
export function useApproveUser() {
  const onSuccess = useWriteModeratedUser();

  return useMutation({
    mutationFn: ({ address, reason }: ModerationInput) => clcApi.admin.approveUser(address, reason),
    onSuccess,
  });
}

/** Ban. */
export function useRejectUser() {
  const onSuccess = useWriteModeratedUser();

  return useMutation({
    mutationFn: ({ address, reason }: ModerationInput) => clcApi.admin.rejectUser(address, reason),
    onSuccess,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ address, role }: { address: string; role: "ADMIN" | "USER" }) =>
      clcApi.admin.updateUserRole(address, role),
    onSuccess: (user) => {
      queryClient.setQueryData<AdminUser | null>(adminKeys.user(user.ethereumAddress), user);
      return queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] });
    },
  });
}

/**
 * SUPERADMIN only: moves an account to a new sign-in card when nothing can
 * sign for the old one. The new card signs; the old card is not involved, and
 * the old wallet's assets stay on chain.
 */
export function useRotateUserKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, newKey }: { address: string; newKey: `0x${string}` }) => {
      const newAddress = privateKeyToAccount(newKey).address;
      const proof = await signSiweMessage(clcApi.auth, privateKeySigner(newKey), {
        domain: window.location.host,
        uri: window.location.origin,
        chainId: CHAIN_ID,
        statement: buildKeyRotationStatement(address, newAddress),
      });
      return clcApi.admin.rotateUserKey(address, proof);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useUpdateUserProfile() {
  const writeUser = useWriteUserToCache();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ address, profile }: { address: string; profile: AdminUserProfile }) =>
      clcApi.admin.updateUserProfile(address, profile),
    onSuccess: (user) => {
      writeUser(user);
      return queryClient.invalidateQueries({ queryKey: vocabularyKeys.all });
    },
  });
}

export function useUpdateUserLimits() {
  const writeUser = useWriteUserToCache();

  return useMutation({
    mutationFn: ({ address, limits }: { address: string; limits: AdminUserLimits }) =>
      clcApi.admin.updateUserLimits(address, limits),
    onSuccess: writeUser,
  });
}
