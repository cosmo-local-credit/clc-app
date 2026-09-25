import type {
  CustomTagVocabulary,
  CustomUnitVocabulary,
} from "@clc/api/features/vocabulary/client";
import { validateCustomTag, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { customVocabularyQueryOptions } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { HiOutlinePencil, HiOutlineTag, HiOutlineTrash } from "react-icons/hi";
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
import { Input } from "#/components/ui/input";
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
      cell: ({ row }) => <EditableVocabularyValue kind="tag" value={row.original.value} />,
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
      cell: ({ row }) => <EditableVocabularyValue kind="unit" value={row.original.value} />,
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
      <PageHeader title="Vocabulary" />

      {vocabulary.isPending ? (
        <LoadingBlock rows={5} />
      ) : vocabulary.isError ? (
        <PageState title="Could not load vocabulary" message={vocabulary.error.message} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <VocabularySection title="Custom tags">
            <DataTable
              columns={tagColumns}
              data={vocabulary.data.tags}
              emptyState={
                <EmptyState title="No custom tags" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Custom offering units">
            <DataTable
              columns={unitColumns}
              data={vocabulary.data.units}
              emptyState={
                <EmptyState title="No custom units" icon={<HiOutlineTag className="size-5" />} />
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

function VocabularySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
        {title}
      </h2>
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
          <DialogDescription>This cannot be undone.</DialogDescription>
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

function EditableVocabularyValue({ kind, value }: { kind: "tag" | "unit"; value: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const replacement = draft.trim().replace(/\s+/gu, " ");
  const validationError =
    kind === "tag" ? validateCustomTag(replacement) : validateCustomUnit(replacement);
  const save = useMutation({
    mutationFn: () => clcApi.vocabulary.renameValue(kind, value, replacement),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(`${kind === "tag" ? "Tag" : "Unit"} renamed.`);
      setEditing(false);
    },
  });

  if (!editing)
    return (
      <span className="flex items-center gap-1 font-medium">
        {value}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${value}`}
          onClick={() => {
            setDraft(value);
            save.reset();
            setEditing(true);
          }}
        >
          <HiOutlinePencil />
        </Button>
      </span>
    );

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!validationError && replacement !== value && !save.isPending) save.mutate();
      }}
    >
      <Input
        aria-label={`New ${kind}`}
        value={draft}
        disabled={save.isPending}
        onChange={(event) => {
          setDraft(event.target.value);
          save.reset();
        }}
      />
      <p className="text-xs text-muted-foreground">Updates this value everywhere it is used.</p>
      {(validationError || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {validationError ?? save.error?.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={save.isPending || Boolean(validationError) || replacement === value}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
