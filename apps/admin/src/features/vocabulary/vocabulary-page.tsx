import type {
  CustomTagVocabulary,
  CustomUnitVocabulary,
} from "@clc/api/features/vocabulary/client";
import { customVocabularyQueryOptions } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { HiOutlineTag, HiOutlineTrash } from "react-icons/hi";
import { toast } from "sonner";

import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { clcApi } from "#/lib/api";

type PendingDelete =
  | { kind: "tag"; row: CustomTagVocabulary }
  | { kind: "unit"; row: CustomUnitVocabulary };

export function VocabularyPage() {
  const queryClient = useQueryClient();
  const vocabulary = useQuery(customVocabularyQueryOptions(clcApi.vocabulary));
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const remove = useMutation({
    mutationFn: (target: PendingDelete) =>
      target.kind === "tag"
        ? clcApi.vocabulary.deleteTag(target.row.value)
        : clcApi.vocabulary.deleteUnit(target.row.value),
    onSuccess: async (_, target) => {
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(`${target.kind === "tag" ? "Tag" : "Unit"} deleted.`);
      setPendingDelete(null);
    },
  });

  const tagColumns: Array<ColumnDef<CustomTagVocabulary>> = [
    {
      accessorKey: "value",
      header: "Tag",
      cell: ({ row }) => <span className="font-medium">{row.original.value}</span>,
    },
    {
      accessorKey: "total",
      header: "References",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-data text-xs">{row.original.total}</span>,
    },
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${row.original.value}`}
          onClick={() => setPendingDelete({ kind: "tag", row: row.original })}
        >
          <HiOutlineTrash />
        </Button>
      ),
    },
  ];

  const unitColumns: Array<ColumnDef<CustomUnitVocabulary>> = [
    {
      accessorKey: "value",
      header: "Offering unit",
      cell: ({ row }) => <span className="font-medium">{row.original.value}</span>,
    },
    {
      accessorKey: "offerings",
      header: "Offerings",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-data text-xs">{row.original.offerings}</span>,
    },
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${row.original.value}`}
          onClick={() => setPendingDelete({ kind: "unit", row: row.original })}
        >
          <HiOutlineTrash />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vocabulary"
        description="Custom tags and offering units added through catalog forms. Built-in values are protected."
      />

      {vocabulary.isPending ? (
        <LoadingBlock rows={5} />
      ) : vocabulary.isError ? (
        <PageState title="Could not load vocabulary" message={vocabulary.error.message} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <VocabularySection
            title="Custom tags"
            description="Deleting a tag removes it from every voucher, pool, post, offering, and pending deployment."
          >
            <DataTable
              columns={tagColumns}
              data={vocabulary.data.tags}
              emptyState={
                <EmptyState
                  title="No custom tags"
                  description="Tags added by users will appear here."
                  icon={<HiOutlineTag className="size-5" />}
                />
              }
            />
          </VocabularySection>

          <VocabularySection
            title="Custom offering units"
            description="Deleting a unit clears it from affected offerings without deleting those offerings."
          >
            <DataTable
              columns={unitColumns}
              data={vocabulary.data.units}
              emptyState={
                <EmptyState
                  title="No custom units"
                  description="Offering units added by users will appear here."
                  icon={<HiOutlineTag className="size-5" />}
                />
              }
            />
          </VocabularySection>
        </div>
      )}

      <DeleteVocabularyDialog
        target={pendingDelete}
        pending={remove.isPending}
        error={remove.error}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete);
        }}
      />
    </div>
  );
}

function VocabularySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
          {title}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function DeleteVocabularyDialog({
  target,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  target: PendingDelete | null;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const details = target ? deletionDetails(target) : [];
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="rounded-none" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Delete “{target?.row.value}”?</DialogTitle>
          <DialogDescription>
            This cannot be undone. The value can be added again by a later catalog write.
          </DialogDescription>
        </DialogHeader>

        {details.length > 0 ? (
          <ul className="border-border bg-card space-y-1 border p-3 text-sm">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">This value currently has no references.</p>
        )}
        {error ? <p className="text-destructive text-sm">{error.message}</p> : null}

        <DialogFooter className="rounded-none">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete everywhere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function deletionDetails(target: PendingDelete): string[] {
  if (target.kind === "unit") {
    return target.row.offerings > 0
      ? [`Clear the unit from ${plural(target.row.offerings, "offering")}.`]
      : [];
  }

  const counts: Array<[number, string]> = [
    [target.row.vouchers, "voucher"],
    [target.row.pools, "pool"],
    [target.row.posts, "post"],
    [target.row.offerings, "offering"],
    [target.row.deployedTokens, "voucher deployment"],
    [target.row.deployedPools, "pool deployment"],
  ];
  return counts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `Remove from ${plural(count, noun)}.`);
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
