import { render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { fireEvent } from "@testing-library/dom";
import { Profiler } from "react";
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
  it("settles after mounting when the caller passes no sort state", async () => {
    // A fresh `[]` default per render makes TanStack Table recompute the sorted
    // rows every render, queue a page-index reset, and set state again — a
    // render loop that pins the tab's main thread while the table is on screen.
    // `act` would wait for React to go quiet, which a loop never does, so the
    // commits are counted on real timers instead.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const actEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
    try {
      let commits = 0;
      const tree = () => (
        <Profiler id="table" onRender={() => void (commits += 1)}>
          <DataTable columns={columns} data={rows} />
        </Profiler>
      );
      const { rerender } = render(tree());
      // The first recompute only arms the reset, in a microtask; a later parent
      // re-render is what sets the loop going, as the batch page's progress did.
      await tick();
      rerender(tree());
      await tick();
      const settled = commits;
      await tick();
      expect(commits).toBe(settled);
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    }
  });

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

  it("accepts a row-height baseline without constraining richer cell content", () => {
    render(<DataTable columns={columns} data={rows} rowClassName="h-12" />);

    expect(screen.getAllByRole("row")[1]?.className).toContain("h-12");
  });

  it("renders a footer under the table, but not in place of the empty state", () => {
    // The pager lives here now, so it must appear with rows and stay away when the
    // empty state replaces the table — a pager over "no rows" is nonsense.
    const { unmount } = render(
      <DataTable columns={columns} data={rows} footer={<span>pager</span>} />,
    );
    expect(screen.getByText("pager")).toBeTruthy();
    unmount();

    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<span>nothing here</span>}
        footer={<span>pager</span>}
      />,
    );
    expect(screen.getByText("nothing here")).toBeTruthy();
    expect(screen.queryByText("pager")).toBeNull();
  });

  it("announces the sort direction on the sorted column header", () => {
    // The arrow glyph is decorative; aria-sort is what a screen reader reads.
    render(<DataTable columns={columns} data={rows} sorting={[{ id: "name", desc: true }]} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]?.getAttribute("aria-sort")).toBe("descending");
    expect(headers[1]?.getAttribute("aria-sort")).toBe("none");
    // A column that opts out of sorting carries no aria-sort at all.
    expect(headers[2]?.getAttribute("aria-sort")).toBeNull();
  });
});
