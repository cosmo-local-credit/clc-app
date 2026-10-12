import type { TagVocabulary, UnitVocabulary } from "@clc/api/features/vocabulary/client";
import { adminVocabularyQueryOptions } from "@clc/api/features/vocabulary/queries";
import { validateCustomTag, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
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

type VocabularyTarget = { kind: "tag"; row: TagVocabulary } | { kind: "unit"; row: UnitVocabulary };

/**
 * Every tag and unit, custom and default.
 *
 * Nothing stateful renders inside a table cell. The column definitions are
 * rebuilt on each render and the table mounts each `cell` as its own component,
 * so a cell's state would be discarded whenever this page re-renders. Both edits
 * therefore run in dialogs owned here, and a target names its value rather than
 * a row position that a refetch can shift.
 */
export function VocabularyPage() {
  const queryClient = useQueryClient();
  const vocabulary = useQuery(adminVocabularyQueryOptions(clcApi.vocabulary));
  const [pendingDelete, setPendingDelete] = useState<VocabularyTarget | null>(null);
  const [pendingRename, setPendingRename] = useState<VocabularyTarget | null>(null);

  const remove = useMutation({
    mutationFn: (target: VocabularyTarget) =>
      target.kind === "tag"
        ? clcApi.vocabulary.deleteTag(target.row.value)
        : clcApi.vocabulary.deleteUnit(target.row.value),
    onSuccess: async (_, target) => {
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(`${target.kind === "tag" ? "Tag" : "Unit"} deleted.`);
      setPendingDelete(null);
    },
  });

  const rename = useMutation({
    mutationFn: ({ target, replacement }: { target: VocabularyTarget; replacement: string }) =>
      clcApi.vocabulary.renameValue(target.kind, target.row.value, replacement),
    onSuccess: async (_, { target }) => {
      // A renamed value appears in every catalog list that carried it.
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(`${target.kind === "tag" ? "Tag" : "Unit"} renamed.`);
      setPendingRename(null);
    },
  });

  function openRename(target: VocabularyTarget) {
    rename.reset();
    setPendingRename(target);
  }

  const tagColumns: Array<ColumnDef<TagVocabulary>> = [
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
      // Default tags are renamed to fit a deployment, never deleted.
      cell: ({ row }) => (
        <VocabularyActions
          value={row.original.value}
          onRename={() => openRename({ kind: "tag", row: row.original })}
          onDelete={
            row.original.isCustom
              ? () => setPendingDelete({ kind: "tag", row: row.original })
              : undefined
          }
        />
      ),
    },
  ];

  const unitColumns: Array<ColumnDef<UnitVocabulary>> = [
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
  ];

  const customUnitColumns: Array<ColumnDef<UnitVocabulary>> = [
    ...unitColumns,
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <VocabularyActions
          value={row.original.value}
          onRename={() => openRename({ kind: "unit", row: row.original })}
          onDelete={() => setPendingDelete({ kind: "unit", row: row.original })}
        />
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
              data={vocabulary.data.tags.filter((row) => row.isCustom)}
              emptyState={
                <EmptyState title="No custom tags" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Custom offering units">
            <DataTable
              columns={customUnitColumns}
              data={vocabulary.data.units.filter((row) => row.isCustom)}
              emptyState={
                <EmptyState title="No custom units" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Default tags" description="Cannot be deleted.">
            <DataTable
              columns={tagColumns}
              data={vocabulary.data.tags.filter((row) => !row.isCustom)}
              emptyState={
                <EmptyState title="No default tags" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection
            title="Default offering units"
            description="Cannot be renamed or deleted."
          >
            <DataTable
              columns={unitColumns}
              data={vocabulary.data.units.filter((row) => !row.isCustom)}
              emptyState={
                <EmptyState title="No default units" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>
        </div>
      )}

      <RenameVocabularyDialog
        target={pendingRename}
        pending={rename.isPending}
        error={rename.error}
        onDraftChange={() => {
          if (rename.isError) rename.reset();
        }}
        onCancel={() => setPendingRename(null)}
        onConfirm={(replacement) => {
          if (pendingRename) rename.mutate({ target: pendingRename, replacement });
        }}
      />

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
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
          {title}
        </h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function VocabularyActions({
  value,
  onRename,
  onDelete,
}: {
  value: string;
  onRename: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${value}`}
        onClick={onRename}
      >
        <HiOutlinePencil />
      </Button>
      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${value}`}
          onClick={onDelete}
        >
          <HiOutlineTrash />
        </Button>
      ) : null}
    </div>
  );
}

function RenameVocabularyDialog({
  target,
  pending,
  error,
  onDraftChange,
  onCancel,
  onConfirm,
}: {
  target: VocabularyTarget | null;
  pending: boolean;
  error: Error | null;
  onDraftChange: () => void;
  onCancel: () => void;
  onConfirm: (replacement: string) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent showCloseButton={!pending}>
        {/* Keyed so each opening starts from the stored spelling. */}
        {target ? (
          <RenameVocabularyForm
            key={`${target.kind}:${target.row.value}`}
            target={target}
            pending={pending}
            error={error}
            onDraftChange={onDraftChange}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameVocabularyForm({
  target,
  pending,
  error,
  onDraftChange,
  onCancel,
  onConfirm,
}: {
  target: VocabularyTarget;
  pending: boolean;
  error: Error | null;
  onDraftChange: () => void;
  onCancel: () => void;
  onConfirm: (replacement: string) => void;
}) {
  const [draft, setDraft] = useState(target.row.value);
  // The backend collapses whitespace the same way and keeps the casing as typed,
  // so a rename can correct "kwh" to "kWh".
  const replacement = draft.trim().replace(/\s+/gu, " ");
  const invalid =
    target.kind === "tag" ? validateCustomTag(replacement) : validateCustomUnit(replacement);
  const unchanged = replacement === target.row.value;
  const message = invalid ?? error?.message;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid && !unchanged && !pending) onConfirm(replacement);
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename “{target.row.value}”</DialogTitle>
        <DialogDescription>Updates this {target.kind} everywhere it is used.</DialogDescription>
      </DialogHeader>

      <Input
        aria-label={`New ${target.kind}`}
        value={draft}
        disabled={pending}
        onChange={(event) => {
          setDraft(event.target.value);
          onDraftChange();
        }}
      />
      {message ? (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || Boolean(invalid) || unchanged}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteVocabularyDialog({
  target,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  target: VocabularyTarget | null;
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
        ) : null}
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

function deletionDetails(target: VocabularyTarget): string[] {
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
