import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  focusFirstInvalidControl,
  useFirstInvalidFieldFocus,
} from "./use-first-invalid-field-focus";

const originalMatchMedia = window.matchMedia;

function formWithControls(markup: string) {
  const form = document.createElement("form");
  form.innerHTML = markup;
  document.body.append(form);
  return form;
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("focusFirstInvalidControl", () => {
  it("focuses and centers the first enabled invalid control in document order", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const form = formWithControls(`
      <input aria-invalid="false" />
      <input aria-invalid="true" disabled />
      <input id="first" aria-invalid="true" />
      <button id="second" aria-invalid="true">Second</button>
    `);

    expect(focusFirstInvalidControl(form)).toBe(true);
    expect(document.activeElement?.id).toBe("first");
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  });

  it("uses instant scrolling for reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const form = formWithControls('<textarea aria-invalid="true"></textarea>');

    focusFirstInvalidControl(form);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto", block: "center" }),
    );
  });

  it("does nothing when no eligible invalid control exists", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const form = formWithControls(`
      <input type="hidden" aria-invalid="true" />
      <button aria-invalid="true" aria-disabled="true">Unavailable</button>
    `);

    expect(focusFirstInvalidControl(form)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

function FocusHarness() {
  const { formRef, focusFirstInvalidField } = useFirstInvalidFieldFocus();
  return (
    <form ref={formRef}>
      <input aria-invalid="true" aria-label="Invalid field" />
      <button type="button" onClick={focusFirstInvalidField}>
        Focus
      </button>
    </form>
  );
}

describe("useFirstInvalidFieldFocus", () => {
  it("coalesces repeated requests into the latest animation frame", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        nextFrame += 1;
        frames.set(nextFrame, callback);
        return nextFrame;
      });
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((frame) => {
        frames.delete(frame);
      });
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const { getByRole } = render(<FocusHarness />);

    fireEvent.click(getByRole("button", { name: "Focus" }));
    fireEvent.click(getByRole("button", { name: "Focus" }));

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    act(() => frames.get(2)?.(0));
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Invalid field" }));
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("cancels a pending request when the form unmounts", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(17);
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { getByRole, unmount } = render(<FocusHarness />);

    fireEvent.click(getByRole("button", { name: "Focus" }));
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
  });
});
