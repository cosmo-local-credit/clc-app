import type {
  TagVocabulary,
  UnitOfAccountVocabulary,
  UnitVocabulary,
} from "@clc/api/features/vocabulary/client";
import { adminVocabularyQueryOptions } from "@clc/api/features/vocabulary/queries";
import { validateCustomTag, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useId, useState } from "react";
import { HiChevronDown, HiOutlinePencil, HiOutlineTag, HiOutlineTrash } from "react-icons/hi";
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
import { cn } from "#/lib/utils";

type VocabularyTarget =
  | { kind: "tag"; row: TagVocabulary }
  | { kind: "unit"; row: UnitVocabulary }
  | { kind: "unitOfAccount"; row: UnitOfAccountVocabulary };

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

  const createUnitOfAccount = useMutation({
    mutationFn: (value: string) => clcApi.vocabulary.createUnitOfAccount(value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success("Unit of account added.");
    },
  });

  const remove = useMutation({
    mutationFn: async (target: VocabularyTarget) => {
      if (target.kind === "tag") await clcApi.vocabulary.deleteTag(target.row.value);
      else if (target.kind === "unit") await clcApi.vocabulary.deleteUnit(target.row.value);
      else await clcApi.vocabulary.deleteUnitOfAccount(target.row.value);
    },
    onSuccess: async (_, target) => {
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(
        `${target.kind === "tag" ? "Tag" : target.kind === "unit" ? "Unit" : "Unit of account"} deleted.`,
      );
      setPendingDelete(null);
    },
  });

  const rename = useMutation({
    mutationFn: ({ target, replacement }: { target: VocabularyTarget; replacement: string }) =>
      target.kind === "unitOfAccount"
        ? clcApi.vocabulary.renameUnitOfAccount(target.row.value, replacement)
        : clcApi.vocabulary.renameValue(target.kind, target.row.value, replacement),
    onSuccess: async (_, { target }) => {
      // A renamed value appears in every catalog list that carried it.
      await queryClient.invalidateQueries({ queryKey: ["clc"] });
      toast.success(
        `${target.kind === "tag" ? "Tag" : target.kind === "unit" ? "Unit" : "Unit of account"} renamed.`,
      );
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

  const unitOfAccountColumns: Array<ColumnDef<UnitOfAccountVocabulary>> = [
    {
      accessorKey: "value",
      header: "Unit of account",
      cell: ({ row }) => <span className="font-medium">{row.original.value}</span>,
    },
    ...(["profiles", "vouchers", "pools", "voucherDeployments", "poolDeployments"] as const).map(
      (key) => ({
        accessorKey: key,
        header:
          key === "voucherDeployments"
            ? "Voucher deploys"
            : key === "poolDeployments"
              ? "Pool deploys"
              : key[0]?.toUpperCase() + key.slice(1),
        meta: { align: "right" as const },
        cell: ({ row }: { row: { original: UnitOfAccountVocabulary } }) => (
          <span className="font-data text-xs">{row.original[key]}</span>
        ),
      }),
    ),
  ];

  const customUnitOfAccountColumns: Array<ColumnDef<UnitOfAccountVocabulary>> = [
    ...unitOfAccountColumns,
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <VocabularyActions
          value={row.original.value}
          onRename={() => openRename({ kind: "unitOfAccount", row: row.original })}
          onDelete={() => setPendingDelete({ kind: "unitOfAccount", row: row.original })}
          deleteDisabledReason={
            row.original.total > 0
              ? `Referenced ${row.original.total} time${row.original.total === 1 ? "" : "s"}; remove those references before deleting.`
              : undefined
          }
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
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <VocabularySection title="Custom Units of Account" defaultOpen wide>
            <AddUnitOfAccountForm
              pending={createUnitOfAccount.isPending}
              error={createUnitOfAccount.error}
              onAdd={(value) => createUnitOfAccount.mutateAsync(value)}
            />
            <DataTable
              columns={customUnitOfAccountColumns}
              data={vocabulary.data.unitsOfAccount.filter((row) => row.isCustom)}
              emptyState={
                <EmptyState
                  title="No custom units of account"
                  icon={<HiOutlineTag className="size-5" />}
                />
              }
            />
          </VocabularySection>

          <VocabularySection title="Custom offering units" defaultOpen>
            <DataTable
              columns={customUnitColumns}
              data={vocabulary.data.units.filter((row) => row.isCustom)}
              emptyState={
                <EmptyState title="No custom units" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Custom tags" defaultOpen>
            <DataTable
              columns={tagColumns}
              data={vocabulary.data.tags.filter((row) => row.isCustom)}
              emptyState={
                <EmptyState title="No custom tags" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Default tags">
            <DataTable
              columns={tagColumns}
              data={vocabulary.data.tags.filter((row) => !row.isCustom)}
              emptyState={
                <EmptyState title="No default tags" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Default offering units">
            <DataTable
              columns={unitColumns}
              data={vocabulary.data.units.filter((row) => !row.isCustom)}
              emptyState={
                <EmptyState title="No default units" icon={<HiOutlineTag className="size-5" />} />
              }
            />
          </VocabularySection>

          <VocabularySection title="Default Units of Account" wide>
            <DataTable
              columns={unitOfAccountColumns}
              data={vocabulary.data.unitsOfAccount.filter((row) => !row.isCustom)}
              emptyState={
                <EmptyState
                  title="No default units of account"
                  icon={<HiOutlineTag className="size-5" />}
                />
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

function AddUnitOfAccountForm({
  pending,
  error,
  onAdd,
}: {
  pending: boolean;
  error: Error | null;
  onAdd: (value: string) => Promise<string>;
}) {
  const [value, setValue] = useState("");
  const normalized = value.trim().replace(/\s+/gu, " ");
  const invalid = validateCustomUnit(normalized);
  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid || pending) return;
        void onAdd(normalized).then(() => setValue(""));
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          aria-label="New unit of account"
          placeholder="Hours"
          value={value}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <p className="mt-1 text-destructive text-sm">{error.message}</p> : null}
      </div>
      <Button type="submit" disabled={pending || Boolean(invalid)}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

function VocabularySection({
  title,
  children,
  defaultOpen = false,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={cn("min-w-0", wide && "xl:col-span-2")}>
      <h2 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
        <button
          type="button"
          className="border-border bg-card focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-10 w-full items-center justify-between gap-3 border px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-1"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{title}</span>
          <HiChevronDown
            aria-hidden="true"
            className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
      </h2>
      <div id={contentId} hidden={!open} className="mt-3 space-y-3">
        {children}
      </div>
    </section>
  );
}

function VocabularyActions({
  value,
  onRename,
  onDelete,
  deleteDisabledReason,
}: {
  value: string;
  onRename: () => void;
  onDelete?: () => void;
  deleteDisabledReason?: string;
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
          disabled={Boolean(deleteDisabledReason)}
          title={deleteDisabledReason}
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
        <DialogDescription>
          Updates this {target.kind === "unitOfAccount" ? "unit of account" : target.kind}{" "}
          everywhere it is used.
        </DialogDescription>
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

  if (target.kind === "unitOfAccount") {
    const counts: Array<[number, string]> = [
      [target.row.profiles, "profile"],
      [target.row.vouchers, "voucher"],
      [target.row.pools, "pool"],
      [target.row.voucherDeployments, "voucher deployment"],
      [target.row.poolDeployments, "pool deployment"],
    ];
    return counts
      .filter(([count]) => count > 0)
      .map(([count, noun]) => `Referenced by ${plural(count, noun)}.`);
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
