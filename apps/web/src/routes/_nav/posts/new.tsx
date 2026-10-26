import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";

const PostEditorDesk = lazy(() =>
  import("#/desktop/posts/post-editor-desk").then((module) => ({
    default: module.PostEditorDesk,
  })),
);

/**
 * A voucher may be carried in from its own screen, so writing about a voucher
 * does not start with searching for it again. Both halves must be present for
 * the seed to mean anything — a chain without an address names nothing — and the
 * name is a label for the row the picker renders, not an identity.
 */
const searchSchema = z.object({
  voucher: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional()
    .catch(undefined),
  chainId: z.coerce.number().int().positive().optional().catch(undefined),
  voucherName: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/posts/new")({
  staticData: { navOwner: "posts", desktop: "fill" },
  validateSearch: searchSchema,
  component: NewPostRoute,
});

function NewPostRoute() {
  const { voucher, chainId, voucherName } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <div className="min-h-[100svh] bg-background pb-bottom-nav text-foreground">
            <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
              <PostEditorPage
                mode="create"
                voucher={
                  voucher && chainId ? { chainId, address: voucher, name: voucherName } : null
                }
              />
            </main>
          </div>
        }
        desktop={<PostEditorDesk mode="new" />}
      />
    </AuthenticatedRoute>
  );
}
