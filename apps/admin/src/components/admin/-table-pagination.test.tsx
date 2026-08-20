import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { TablePagination } from "./table-pagination";

const firstPage = { perPage: 25 as const };

function renderPager(overrides: Partial<ComponentProps<typeof TablePagination>> = {}) {
  const props = {
    search: firstPage,
    dropped: 0,
    isFirstPage: true,
    mightHaveMore: false,
    isFetching: false,
    onFirstPage: vi.fn(),
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    onPageSize: vi.fn(),
    ...overrides,
  };
  render(<TablePagination {...props} />);
  return props;
}

describe("TablePagination", () => {
  it("omits nav buttons on a short first page", () => {
    renderPager();
    expect(screen.queryByRole("button", { name: "First" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
    expect(screen.getByLabelText("Rows per page")).toBeTruthy();
  });

  it("aligns the rows label with the page-size select", () => {
    renderPager({ isFirstPage: false, mightHaveMore: true });
    expect(screen.getByText("Rows").className).toContain("h-9");
    expect(screen.getByLabelText("Rows per page").className).toContain("h-9");
    expect(screen.getByRole("button", { name: "First" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Next page" }).className).toContain("h-9");
  });

  it("offers Next only when another page might exist", () => {
    const { onNextPage } = renderPager({ mightHaveMore: true });
    const next = screen.getByRole("button", { name: "Next page" });
    fireEvent.click(next);
    expect(onNextPage).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "First" })).toBeNull();
  });

  it("offers First and Previous once the view has left the first page", () => {
    const { onFirstPage, onPreviousPage } = renderPager({
      search: { perPage: 25, cursor: 480, dir: "next" },
      isFirstPage: false,
      mightHaveMore: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onFirstPage).toHaveBeenCalledOnce();
    expect(onPreviousPage).toHaveBeenCalledOnce();
  });

  it("reports dropped rows for this page only", () => {
    renderPager({ dropped: 2 });
    expect(screen.getByText(/2 dropped from this page/)).toBeTruthy();
  });

  it("lists the supported page sizes in the rows control", async () => {
    renderPager();
    fireEvent.click(screen.getByLabelText("Rows per page"));
    expect(await screen.findByRole("option", { name: "10" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "25" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "50" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "100" })).toBeTruthy();
  });
});
