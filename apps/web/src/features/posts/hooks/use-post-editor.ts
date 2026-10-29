import {
  ReportPayloadTooLargeError,
  type ManagedReportDetail,
} from "@clc/api/features/reports/client";
import {
  REPORT_MAX_VOUCHERS,
  emptyReportWrite,
  nowReportPeriod,
  poolRefKey,
  reportToFormValues,
  reportWriteSchema,
  voucherRefKey,
  type ReportVoucherRef,
  type ReportWrite,
} from "@clc/core/features/reports/logic";
import { useForm, useStore } from "@clc/core/lib/forms";
import { isAdminRole } from "@clc/core/features/users/roles";
import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  clearPostDraft,
  readPostDraft,
  writePostDraft,
} from "#/features/posts/api/post-draft-storage";
import { useMyPost } from "#/features/posts/hooks/use-my-posts";
import { useCreatePost, useUpdatePost } from "#/features/posts/hooks/use-post-mutations";
import { useTokenTags } from "#/hooks/use-deployment";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { useViewDraft } from "#/lib/view-drafts";

/** Quiet time before an in-progress post is parked in local storage. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

/** A voucher a screen carried in, so the post opens already linked to it. */
export type SeedVoucher = { chainId: number; address: string; name?: string };

export type PostEditorBack = { label: string; to: string; search?: Record<string, unknown> };

/** Everything one editor form starts from. */
export type PostEditorSeed = {
  post?: ManagedReportDetail;
  initial: ReportWrite;
  /** Names for chips the picker's search may not return, keyed by `voucherRefKey`. */
  linkedNames: Map<string, string>;
  linkedPoolNames: Map<string, string>;
  back?: PostEditorBack;
  /**
   * Local draft persistence, on the create screen only. An edit has a server
   * copy of the same post, and whichever copy won would depend on which screen
   * was opened last.
   */
  draft?: { owner: string; restored: boolean; onStartOver: () => void };
  previousStatus: ManagedReportDetail["status"] | null;
};

/**
 * What a new post starts with, or null while the profile loads.
 *
 * The saved place and the moment of writing seed the new post, while a voucher
 * a screen carried in arrives linked. The profile name deliberately does not
 * seed the public Host field: naming a host is an explicit author choice.
 *
 * A draft this device parked wins over all of it: it is what the author
 * actually typed. The profile read is awaited rather than merged in later
 * because TanStack Form reads `defaultValues` once, so a form mounted before
 * the profile arrived would keep an empty Place.
 *
 * `formKey` changes when the draft is dropped: `defaultValues` is read once, so
 * a new starting document is a new form, remounted rather than reset.
 */
export function usePostEditorCreateSeed(
  voucher: SeedVoucher | null,
): { formKey: string; seed: PostEditorSeed } | null {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const profileQuery = useAuthProfile();
  const owner = auth.address?.toLowerCase() ?? "";
  // Read once, on mount: the editor writes to this same slot as it is typed in,
  // so a later read would hand back the values the form already holds.
  const [draft, setDraft] = useState(() => readPostDraft(owner));
  // Stable across renders: the form's save effect keys off this, and a fresh
  // object every keystroke would park the post on every render instead of on
  // the debounce.
  const draftControls = useMemo(
    () => ({
      owner,
      restored: draft !== null,
      onStartOver: () => {
        clearPostDraft();
        setDraft(null);
      },
    }),
    [draft, owner],
  );

  if (profileQuery.isPending) return null;

  const seededRef: ReportVoucherRef | null = voucher
    ? { chainId: voucher.chainId, address: voucher.address }
    : null;
  const profile = profileQuery.data;
  // Both halves of a coordinate or neither: a profile with one is not a place.
  const hasProfileLocation =
    typeof profile?.geoLat === "number" && typeof profile?.geoLng === "number";
  const fresh: ReportWrite = {
    ...emptyReportWrite,
    ...nowReportPeriod(),
    hostName: "",
    geoLat: hasProfileLocation ? (profile?.geoLat ?? null) : null,
    geoLng: hasProfileLocation ? (profile?.geoLng ?? null) : null,
    vouchers: seededRef ? [seededRef] : [],
  };
  // The voucher was pressed just now, so it is linked even when a draft is
  // restored over everything else.
  const initial: ReportWrite = draft
    ? {
        ...draft,
        vouchers:
          seededRef &&
          !draft.vouchers.some((entry) => voucherRefKey(entry) === voucherRefKey(seededRef))
            ? [...draft.vouchers, seededRef].slice(0, REPORT_MAX_VOUCHERS)
            : draft.vouchers,
      }
    : fresh;

  return {
    formKey: draft ? "draft" : "fresh",
    seed: {
      initial,
      linkedNames:
        seededRef && voucher?.name
          ? new Map([[voucherRefKey(seededRef), voucher.name]])
          : new Map<string, string>(),
      linkedPoolNames: new Map<string, string>(),
      // Started from a voucher, so Back names the voucher — and a deep load
      // with no history lands back on the tab the button was pressed from.
      back: seededRef
        ? {
            label: voucher?.name ?? t`Voucher`,
            to: `/vouchers/${seededRef.address}`,
            search: { tab: "posts" },
          }
        : undefined,
      draft: draftControls,
      previousStatus: null,
    },
  };
}

/** The author's own copy of a post, and what its editor starts from once loaded. */
export function usePostEditorEditSeed(reportId: string) {
  const postQuery = useMyPost(reportId);
  const post = postQuery.data;
  const seed: PostEditorSeed | null = post
    ? {
        post,
        initial: reportToFormValues(post),
        linkedNames: new Map(
          post.vouchers.map((voucher) => [
            voucherRefKey({ chainId: voucher.chainId, address: voucher.address }),
            voucher.name,
          ]),
        ),
        linkedPoolNames: new Map(
          (post.pools ?? []).map((pool) => [
            poolRefKey({ chainId: pool.chainId, address: pool.address }),
            pool.name,
          ]),
        ),
        previousStatus: post.status,
      }
    : null;
  return { postQuery, seed };
}

/**
 * The editor's form: validation, submit, the parked draft and the unload
 * prompt. In-app leave confirmation stays with each screen, since how one
 * leaves differs.
 */
export function usePostEditorForm({
  post,
  initial,
  draft,
  previousStatus,
}: Pick<PostEditorSeed, "post" | "initial" | "draft" | "previousStatus">) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const auth = useAuthStatus();
  const tagsQuery = useTokenTags();
  const create = useCreatePost();
  const update = useUpdatePost(previousStatus);

  /** Bytes in flight. Save would otherwise persist the list from before them. */
  const [imagesBusy, setImagesBusy] = useState(false);

  const saving = create.isPending || update.isPending;
  // A post may only link vouchers its author owns, unless the author has an
  // administrative role. A session with no role is treated as unprivileged: the picker
  // then offers less than the backend might allow, never more than it accepts.
  const voucherOwner = isAdminRole(auth.session?.role)
    ? undefined
    : (auth.session?.address ?? auth.address);

  // The in-memory handoff also covers a new post's latest changes while its
  // local-storage debounce is still pending. The parked draft keeps its one
  // persistence owner below; this handoff is only for the layout swap.
  // Media in ReportWrite is already uploaded: URLs and metadata, including
  // removals and the selected cover. Carry those edits too, without repeating
  // uploads. The bridge still rejects files, blobs, local URLs, and secrets.
  const viewDraft = useViewDraft<ReportWrite>({
    scope: post ? `post-edit:${post.id}` : "post-create",
    account: auth.address,
  });
  const restored = viewDraft.restored;
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: reportWriteSchema },
    onSubmit: async ({ value }) => {
      try {
        if (post) {
          const saved = await update.mutateAsync({ id: post.id, input: value });
          viewDraft.clear();
          toast.success(
            saved.status === "APPROVED"
              ? t`Post updated.`
              : t`Saved. Your post is awaiting approval again.`,
          );
        } else {
          await create.mutateAsync(value);
          viewDraft.clear();
          clearPostDraft();
          toast.success(t`Post published.`);
        }
        await navigate({ to: "/posts/mine" });
      } catch (error) {
        // The form keeps its values, including uploaded URLs, so a retry does
        // not re-send the bytes.
        if (error instanceof ReportPayloadTooLargeError) {
          toast.error(t`This post is too large to save. Shorten the text or remove some media.`);
          return;
        }
        toast.error(error instanceof Error ? error.message : t`Couldn't save your post.`);
      }
    },
  });

  // Read through the store: `form.state` is a snapshot taken at render time and
  // does not re-render when the form changes, so the back guard and the unload
  // prompt would both stay armed against the values the page mounted with.
  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isDirty = formIsDirty && !saving;
  const values = useStore(form.store, (state) => state.values);
  // Debounced, because this runs on every keystroke and a draft is only ever
  // read on a later visit; `isDirty` is false while saving, which is what stops
  // a write landing after the submit that cleared the draft.
  const { settled: settledValues, isPending: settling } = useDebouncedValue(
    values,
    DRAFT_SAVE_DEBOUNCE_MS,
  );

  useEffect(() => {
    // `settling` matters as much as the debounce: the settled values lag the
    // form, so the render that first turns the form dirty still holds the
    // values it mounted with, and writing those would park an empty post.
    if (!draft || !isDirty || settling) return;
    writePostDraft(draft.owner, settledValues);
  }, [draft, isDirty, settledValues, settling]);

  // What was written in the other view goes back on top of the saved post. It is
  // set as an edit, not a new starting point, so the form is dirty again and the
  // leave guard and the unload prompt cover it.
  const [restoring, setRestoring] = useState(restored !== undefined);
  useEffect(() => {
    if (!restored) return;
    for (const [name, value] of Object.entries(restored)) {
      form.setFieldValue(name as keyof ReportWrite, value as never);
    }
    setRestoring(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Keep the written fields for a phone/desktop view swap while they differ from
  // how the editor opened; forget them when they are back to that. Not while the
  // restored fields are still being applied: those renders hold the saved values.
  const { save: saveViewDraft, clear: clearViewDraft } = viewDraft;
  const [opened] = useState(() => JSON.stringify(initial));
  useEffect(() => {
    if (restoring) return;
    if (JSON.stringify(values) === opened) clearViewDraft();
    else saveViewDraft(values);
  }, [clearViewDraft, opened, restoring, saveViewDraft, values]);

  // The browser's own prompt covers a reload or a closed tab; each screen's
  // leave dialog covers in-app navigation, which this never sees.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return {
    form,
    values,
    saving,
    isDirty,
    imagesBusy,
    setImagesBusy,
    voucherOwner,
    tagsQuery,
    /** Discard means discard: the parked copy goes with the changes. */
    discardDraft: () => {
      viewDraft.clear();
      if (draft) clearPostDraft();
    },
  };
}
