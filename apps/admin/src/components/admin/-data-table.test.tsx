import { render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vite-plus/test";
import { DataTable } from "./data-table";

type Row = { name: string; count: number };

const columns: Array<ColumnDef<Row>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "count", header: "Count" },
  { id: "static", header: "Static", enableSorting: false, cell: () => "—" },
];

const rows: Array<Row> = [
  { name: "Malindi Traders", count: 2 },
  { name: "Kilifi Growers", count: 9 },
  { name: "Watamu Fishers", count: 5 },
];

function names() {
  // Row cells only — skip the header row.
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[0]?.textContent);
}

describe("DataTable", () => {
  it("renders one row per record in source order before any sort", () => {
    render(<DataTable columns={columns} data={rows} />);
    expect(names()).toEqual(["Malindi Traders", "Kilifi Growers", "Watamu Fishers"]);
  });

  it("reports the activated column instead of sorting itself", () => {
    // Sort state belongs to the route's search params so the URL describes the
    // view and Back restores it; the table only says which header was pressed.
    const onSortChange = vi.fn();
    render(<DataTable columns={columns} data={rows} onSortChange={onSortChange} />);

    fireEvent.click(screen.getByRole("button", { name: /count/i }));
    expect(onSortChange).toHaveBeenCalledExactlyOnceWith("count");
  });

  it("renders rows in the order the caller's sort state describes", () => {
    const { rerender } = render(
      <DataTable columns={columns} data={rows} sorting={[{ id: "name", desc: false }]} />,
    );
    expect(names()).toEqual(["Kilifi Growers", "Malindi Traders", "Watamu Fishers"]);

    rerender(<DataTable columns={columns} data={rows} sorting={[{ id: "count", desc: true }]} />);
    expect(names()).toEqual(["Kilifi Growers", "Watamu Fishers", "Malindi Traders"]);
  });

  it("shows the sort direction its caller declared", () => {
    render(<DataTable columns={columns} data={rows} sorting={[{ id: "name", desc: true }]} />);
    const header = screen.getByRole("button", { name: /name/i });
    expect(header.querySelector("svg")).toBeTruthy();
  });

  it("gives no sort control to a column that opts out", () => {
    render(<DataTable columns={columns} data={rows} />);
    expect(screen.queryByRole("button", { name: /static/i })).toBeNull();
  });

  it("renders the empty state instead of an empty table when there are no rows", () => {
    render(<DataTable columns={columns} data={[]} emptyState={<p>No pools indexed</p>} />);

    expect(screen.getByText("No pools indexed")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("still renders a headed table with no rows when no empty state is supplied", () => {
    render(<DataTable columns={columns} data={[]} />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("passes the original record to onRowClick, not the wrapped row model", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);

    const secondRow = screen.getAllByRole("row")[2];
    if (secondRow) fireEvent.click(secondRow);

    expect(onRowClick).toHaveBeenCalledExactlyOnceWith({ name: "Kilifi Growers", count: 9 });
  });
});
