import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { type DeskColumn, DeskTable } from "./data-table";

type Row = { id: string; name: string; amount: number };

const ROWS: Row[] = [
  { id: "a", name: "Bravo", amount: 30 },
  { id: "b", name: "Alpha", amount: 5 },
  { id: "c", name: "Charlie", amount: 120 },
];

const COLUMNS: DeskColumn<Row>[] = [
  { id: "name", header: "Name", sortValue: (row) => row.name, cell: (row) => row.name },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    sortValue: (row) => row.amount,
    cell: (row) => String(row.amount),
  },
  { id: "note", header: "Note", cell: () => "-" },
];

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

describe("DeskTable", () => {
  it("gives every cell a role inside a labelled table", () => {
    render(<DeskTable label="Holdings" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} />);
    expect(screen.getByRole("table", { name: "Holdings" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getAllByRole("cell")).toHaveLength(ROWS.length * COLUMNS.length);
  });

  it("sorts through a button inside the header and reports aria-sort", () => {
    render(<DeskTable label="Holdings" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} />);
    const header = screen.getByRole("columnheader", { name: /Amount/ });
    expect(header.getAttribute("aria-sort")).toBe("none");
    // The header is not itself the control: a button inside it is.
    expect(header.tagName).not.toBe("BUTTON");
    // Unsortable columns have no button and no aria-sort.
    expect(screen.getByRole("columnheader", { name: "Note" }).getAttribute("aria-sort")).toBeNull();

    const button = within(header).getByRole("button");
    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);

    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]);

    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("none");
    expect(names()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("orders numbers as numbers, not text", () => {
    render(<DeskTable label="Holdings" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} />);
    fireEvent.click(
      within(screen.getByRole("columnheader", { name: /Amount/ })).getByRole("button"),
    );
    // As text "120" < "30" < "5"; as numbers 5 < 30 < 120.
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("says a sort covers only loaded rows, and only while it is sorting a partial list", () => {
    const { rerender } = render(
      <DeskTable label="Holdings" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} partial />,
    );
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(within(screen.getByRole("columnheader", { name: /Name/ })).getByRole("button"));
    expect(screen.getByRole("status").textContent).toContain("3");

    rerender(<DeskTable label="Holdings" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("selects a row on click and marks the selected one", () => {
    const selected: string[] = [];
    render(
      <DeskTable
        label="Holdings"
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        selectedKey="b"
        onSelect={(row) => selected.push(row.id)}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[1]?.getAttribute("data-selected")).toBe("true");
    expect(rows[0]?.getAttribute("data-selected")).toBeNull();
    fireEvent.click(rows[2] as HTMLElement);
    expect(selected).toEqual(["c"]);
  });

  it("shows the empty state instead of rows", () => {
    render(
      <DeskTable
        label="Holdings"
        rows={[]}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        empty="Nothing here"
      />,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.queryAllByRole("cell")).toHaveLength(0);
  });
});
