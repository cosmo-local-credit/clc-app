import { act, fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useSafeSheet } from "../state/safe-sheet";
import { SafePendingOverlay } from "./safe-pending-overlay";

const SAFE = "0x0000000000000000000000000000000000000001";
const HASH = "0x0123456789abcdef";

afterEach(() => useSafeSheet.getState().close());

it("defers the panel and preserves a notification selection across loading", async () => {
  const renderPanel = vi.fn();
  function PendingPanel() {
    const selection = useSafeSheet((state) => state.safeTxHash);
    renderPanel();
    return <p>Selected proposal {selection}</p>;
  }

  let finishImport!: (module: { default: typeof PendingPanel }) => void;
  const importPanel = vi.fn(
    () =>
      new Promise<{ default: typeof PendingPanel }>((resolve) => {
        finishImport = resolve;
      }),
  );
  const LazyPanel = lazy(importPanel);
  render(
    <SafePendingOverlay>
      <LazyPanel />
    </SafePendingOverlay>,
  );

  expect(importPanel).not.toHaveBeenCalled();
  act(() => useSafeSheet.getState().show(SAFE, HASH));
  expect(importPanel).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toBe("Loading…");

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(useSafeSheet.getState().safe).toBeNull();
  await act(async () => finishImport({ default: PendingPanel }));
  expect(renderPanel).not.toHaveBeenCalled();

  act(() => useSafeSheet.getState().show(SAFE, HASH));
  expect(await screen.findByText(`Selected proposal ${HASH}`)).toBeTruthy();
  expect(importPanel).toHaveBeenCalledOnce();
});

it("contains a load failure and offers the same Safe's queue as a fallback", async () => {
  const LazyPanel = lazy(() => Promise.reject(new Error("Chunk could not load")));
  const onCaughtError = vi.fn();
  act(() => useSafeSheet.getState().show(SAFE));
  render(
    <>
      <p>Current page</p>
      <SafePendingOverlay>
        <LazyPanel />
      </SafePendingOverlay>
    </>,
    { onCaughtError },
  );

  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load multisig proposals.");
  expect(screen.getByText("Current page")).toBeTruthy();
  expect(onCaughtError).toHaveBeenCalledOnce();
  const safeLink = screen.getByRole("link", { name: "Open in Safe" });
  expect(new URL(safeLink.getAttribute("href") ?? "").searchParams.get("safe")).toBe(`gno:${SAFE}`);
  expect(safeLink.getAttribute("target")).toBe("_blank");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
