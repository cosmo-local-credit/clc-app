import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { clearViewDrafts, useViewDraft, useViewDraftStore } from "#/lib/view-drafts";

import { DESKTOP_MEDIA } from "./layout";
import { LayoutSwitch } from "./switch";

/**
 * The real `LayoutSwitch` and `useLayout`, driven by a controllable media
 * query, so this proves the ordering the view drafts depend on rather than
 * assuming it: the attribute is written before the old tree unmounts.
 */
const ACCOUNT = "0xAbC0000000000000000000000000000000000001";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

/** What the attribute said at each unmount, newest last. */
const unmounts: string[] = [];
/** What the attribute said when each view rendered. */
const renders: string[] = [];

function Task({ view }: { view: "phone" | "desk" }) {
  const draft = useViewDraft<{ text: string }>({ scope: "task", account: ACCOUNT });
  renders.push(`${view}:${document.documentElement.dataset.layout}`);
  const [text, setText] = useState(draft.restored?.text ?? "");
  useEffect(
    () => () => {
      unmounts.push(`${view}:${document.documentElement.dataset.layout}`);
    },
    [view],
  );
  return (
    <input
      aria-label={view}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        draft.save({ text: event.target.value });
      }}
    />
  );
}

const phone = () => screen.getByLabelText("phone") as HTMLInputElement;
const desk = () => screen.getByLabelText("desk") as HTMLInputElement;

beforeEach(() => {
  media.matches = false;
  media.listeners.clear();
  unmounts.length = 0;
  renders.length = 0;
  clearViewDrafts();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  // Put back only matchMedia: the setup file's other stubs (ResizeObserver) must stay.
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

function mount() {
  return render(<LayoutSwitch mobile={<Task view="phone" />} desktop={<Task view="desk" />} />);
}

describe("view drafts across the real layout switch", () => {
  it("writes the layout attribute before the old view unmounts and the new one renders", () => {
    mount();
    fireEvent.change(phone(), { target: { value: "rent" } });

    setViewport(true);

    expect(unmounts).toEqual(["phone:desktop"]);
    expect(renders.at(-1)).toBe("desk:desktop");
    expect(desk().value).toBe("rent");
  });

  it("carries a draft there and back again across repeated zooms", () => {
    mount();
    fireEvent.change(phone(), { target: { value: "first" } });
    setViewport(true);
    fireEvent.change(desk(), { target: { value: "first, edited" } });
    setViewport(false);
    expect(phone().value).toBe("first, edited");
    setViewport(true);
    expect(desk().value).toBe("first, edited");
  });

  it("does not resurface after the person leaves and comes back in the same layout", () => {
    const first = mount();
    fireEvent.change(phone(), { target: { value: "abandoned" } });
    first.unmount();
    expect(useViewDraftStore.getState().entries).toEqual({});

    mount();

    expect(phone().value).toBe("");
  });

  it("does not resurface after a switch, leaving, and coming back later", () => {
    const first = mount();
    fireEvent.change(phone(), { target: { value: "abandoned" } });
    setViewport(true);
    expect(desk().value).toBe("abandoned");

    first.unmount();
    setViewport(false);
    mount();

    expect(phone().value).toBe("");
  });
});
