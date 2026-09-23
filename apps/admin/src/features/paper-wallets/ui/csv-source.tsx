import {
  PAPER_WALLET_CSV_TEMPLATE,
  type PaperWalletCsvRow,
  parsePaperWalletCsv,
} from "@clc/core/features/paper-wallet-batch/logic";
import type { ColumnDef } from "@tanstack/react-table";
import { useRef, useState } from "react";
import { HiOutlineDocumentDownload, HiOutlineUpload } from "react-icons/hi";

import { DataTable } from "#/components/admin/data-table";
import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { downloadBlob } from "../download";

const columns: Array<ColumnDef<PaperWalletCsvRow>> = [
  {
    accessorKey: "line",
    header: "Row",
    cell: ({ row }) => <span className="font-data text-xs">{row.original.line}</span>,
  },
  { id: "name", header: "Name", accessorFn: (row) => row.recipient.name },
  { id: "email", header: "Email", accessorFn: (row) => row.recipient.email },
  {
    id: "phone",
    header: "Phone",
    accessorFn: (row) => row.recipient.phone,
    cell: ({ getValue }) => <span className="font-data text-xs">{String(getValue())}</span>,
  },
  { id: "country", header: "Country", accessorFn: (row) => row.recipient.country },
  { id: "currency", header: "Currency", accessorFn: (row) => row.recipient.currency },
  {
    id: "issues",
    header: "Issues",
    accessorFn: (row) => row.errors.length,
    cell: ({ row }) =>
      row.original.errors.length ? (
        <span className="text-destructive text-xs">{row.original.errors.join("; ")}</span>
      ) : (
        <span className="text-muted-foreground text-xs">OK</span>
      ),
  },
];

/**
 * CSV upload with a validated preview. Rows with issues are shown and skipped;
 * the operator can fix the file and upload it again, or issue the valid rows.
 */
export function CsvSource({
  rows,
  onRowsChange,
}: {
  rows: PaperWalletCsvRow[] | null;
  onRowsChange: (rows: PaperWalletCsvRow[] | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const result = parsePaperWalletCsv(await file.text());
    if (result.ok) {
      setError(null);
      onRowsChange(result.rows);
    } else {
      setError(result.error);
      onRowsChange(null);
    }
  }

  const invalid = rows?.filter((row) => row.errors.length > 0).length ?? 0;

  return (
    <div className="space-y-4">
      <SectionLabel>Recipients</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <HiOutlineUpload />
          {fileName ? "Choose another file" : "Choose CSV file"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            downloadBlob(
              new Blob([PAPER_WALLET_CSV_TEMPLATE], { type: "text/csv" }),
              "paper-wallets-template.csv",
            )
          }
        >
          <HiOutlineDocumentDownload />
          Download template
        </Button>
        {fileName ? (
          <span className="text-muted-foreground font-mono text-xs">{fileName}</span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="CSV file"
          onChange={(event) => {
            void load(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {rows ? (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-data">{rows.length - invalid}</span> ready
            {invalid ? (
              <>
                {" · "}
                <span className="font-data text-destructive">{invalid}</span> with issues, skipped
              </>
            ) : null}
          </p>
          <div className="max-h-96 overflow-auto">
            <DataTable columns={columns} data={rows} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
