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

  it("sorts a numeric column high-to-low first, then reverses on a second activation", () => {
    render(<DataTable columns={columns} data={rows} />);
    const countHeader = screen.getByRole("button", { name: /count/i });

    // react-table defaults numeric columns to descending on first activation,
    // which is what an operator scanning for the largest value expects.
    fireEvent.click(countHeader);
    expect(names()).toEqual(["Kilifi Growers", "Watamu Fishers", "Malindi Traders"]);

    fireEvent.click(countHeader);
    expect(names()).toEqual(["Malindi Traders", "Watamu Fishers", "Kilifi Growers"]);
  });

  it("sorts a text column A-to-Z first", () => {
    render(<DataTable columns={columns} data={rows} />);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(names()).toEqual(["Kilifi Growers", "Malindi Traders", "Watamu Fishers"]);
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
