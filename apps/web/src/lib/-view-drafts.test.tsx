import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { clearViewDrafts, useViewDraft, useViewDraftStore, type ViewDraft } from "./view-drafts";

type Draft = { text: string };

const ALICE = "0xAbC0000000000000000000000000000000000001";
const BOB = "0xB0b0000000000000000000000000000000000002";

let handle: ViewDraft<unknown> | null = null;

/** A form field that keeps its text through a view swap, the way the real flows do. */
function Field({ account, scope = "flow" }: { account: string | undefined; scope?: string }) {
  const draft = useViewDraft<Draft>({ scope, account });
  handle = draft as ViewDraft<unknown>;
  const [text, setText] = useState(draft.restored?.text ?? "");
  return (
    <>
      <input
        aria-label="field"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          draft.save({ text: event.target.value });
        }}
      />
      <button type="button" onClick={draft.clear}>
        submit
      </button>
    </>
  );
}

function setLayout(layout: "mobile" | "desktop") {
  document.documentElement.dataset.layout = layout;
}

/**
 * What `LayoutSwitch` does: the attribute is written first, then one commit
 * unmounts the old tree and mounts the new one.
 */
function swapTo(view: ReturnType<typeof render>, layout: "mobile" | "desktop", next: ReactElement) {
  setLayout(layout);
  view.rerender(<div key={layout}>{next}</div>);
}

const field = () => screen.getByLabelText("field") as HTMLInputElement;
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const entries = () => useViewDraftStore.getState().entries;

beforeEach(() => {
  setLayout("mobile");
  clearViewDrafts();
  handle = null;
});

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

describe("view drafts", () => {
  it("hands what was typed to the other view after a layout switch", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("rent for May");

    swapTo(view, "desktop", <Field account={ALICE} />);

    expect(field().value).toBe("rent for May");
  });

  it("restores nothing after leaving the flow and coming back in the same layout", () => {
    const view = render(
      <div key="a">
        <Field account={ALICE} />
      </div>,
    );
    type("half-typed payment note");

    // A navigation: the layout attribute does not change.
    view.rerender(<p>somewhere else</p>);
    expect(entries()).toEqual({});
    view.rerender(
      <div key="b">
        <Field account={ALICE} />
      </div>,
    );

    expect(field().value).toBe("");
  });

  it("does not let an entry nobody claimed surface on a later same-layout visit", () => {
    // An entry left behind while the layout is unchanged (the unmount cleanup
    // never ran, or it belongs to another visit) is discarded on mount, not restored.
    useViewDraftStore.setState({
      entries: { [`${ALICE.toLowerCase()}:flow`]: { value: { text: "old" }, layout: "mobile" } },
    });

    render(<Field account={ALICE} />);

    expect(field().value).toBe("");
    expect(entries()).toEqual({});
  });

  it("never shows one account's draft to another", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("alice's payment");

    swapTo(view, "desktop", <Field account={BOB} />);

    expect(field().value).toBe("");
    // Bob's mount neither claimed nor wrote anything under Alice's key or his own.
    expect(Object.keys(entries()).every((key) => key.startsWith(ALICE.toLowerCase()))).toBe(true);
    expect(Object.keys(entries())).not.toContain(`${BOB.toLowerCase()}:flow`);
  });

  it("keeps nothing for a guest", () => {
    const view = render(
      <div key="mobile">
        <Field account={undefined} />
      </div>,
    );
    type("typed while signed out");
    expect(entries()).toEqual({});

    swapTo(view, "desktop", <Field account={undefined} />);

    expect(field().value).toBe("");
    expect(entries()).toEqual({});
  });

  it("scopes a draft to its flow, so another flow of the same account sees none", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} scope="want-edit:7" />
      </div>,
    );
    type("edit of want 7");

    swapTo(view, "desktop", <Field account={ALICE} scope="want-edit:8" />);

    expect(field().value).toBe("");
  });

  it("restores again on a second switch back and forth", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("first");
    swapTo(view, "desktop", <Field account={ALICE} />);
    type("first, then more");

    swapTo(view, "mobile", <Field account={ALICE} />);
    expect(field().value).toBe("first, then more");

    swapTo(view, "desktop", <Field account={ALICE} />);
    expect(field().value).toBe("first, then more");
  });

  it("carries the draft over a switch with no typing in the new view, then forgets it on leaving", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("kept");
    swapTo(view, "desktop", <Field account={ALICE} />);
    // The restored mount re-saved under the new layout without a keystroke.
    expect(Object.values(entries()).map((entry) => entry.layout)).toEqual(["desktop"]);

    view.rerender(<p>left the flow</p>);

    expect(entries()).toEqual({});
  });

  it("restores through React strict mode's mount, unmount, mount", () => {
    const view = render(
      <StrictMode>
        <div key="mobile">
          <Field account={ALICE} />
        </div>
      </StrictMode>,
    );
    type("strict");

    setLayout("desktop");
    view.rerender(
      <StrictMode>
        <div key="desktop">
          <Field account={ALICE} />
        </div>
      </StrictMode>,
    );

    expect(field().value).toBe("strict");
    expect(Object.keys(entries())).toHaveLength(1);
  });

  it("forgets the draft once it is cleared, so a switch after a submit restores nothing", () => {
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("sent");
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(entries()).toEqual({});

    swapTo(view, "desktop", <Field account={ALICE} />);

    expect(field().value).toBe("");
  });

  it("ignores a save that arrives after its view has gone", () => {
    const view = render(
      <div key="a">
        <Field account={ALICE} />
      </div>,
    );
    type("typed");
    const late = handle as ViewDraft<Draft>;

    view.rerender(<p>left</p>);
    late.save({ text: "late async write" });

    expect(entries()).toEqual({});
  });

  it("drops a draft that was not claimed within the grace period", () => {
    vi.useFakeTimers();
    const view = render(
      <div key="mobile">
        <Field account={ALICE} />
      </div>,
    );
    type("orphaned");

    // The swap took the phone view away, but the desktop view never mounted
    // (its chunk was slow and the person left).
    setLayout("desktop");
    view.rerender(<p>another page</p>);
    expect(Object.keys(entries())).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(entries()).toEqual({});

    // A much later visit in the other layout finds nothing.
    view.rerender(
      <div key="later">
        <Field account={ALICE} />
      </div>,
    );
    expect(field().value).toBe("");
  });

  it("deletes the old account's draft when the account changes under a mounted view", () => {
    const view = render(<Field account={ALICE} />);
    type("alice");
    expect(Object.keys(entries())).toEqual([`${ALICE.toLowerCase()}:flow`]);

    view.rerender(<Field account={BOB} />);

    expect(entries()).toEqual({});
  });

  it("stores only plain values, never a file, a blob or data URL, or a secret-shaped key", () => {
    function Greedy({ value }: { value: unknown }) {
      const draft = useViewDraft<unknown>({ scope: "greedy", account: ALICE });
      return (
        <button type="button" onClick={() => draft.save(value)}>
          save
        </button>
      );
    }
    const unsafe: unknown[] = [
      { photo: new File(["x"], "photo.png", { type: "image/png" }) },
      { photoUrl: "blob:https://app.test/0b3c" },
      { logo: "data:image/png;base64,AAAA" },
      { nested: [{ privateKey: "0xabc" }] },
      { password: "hunter2" },
      { mnemonic: "legal winner thank year" },
    ];
    for (const value of unsafe) {
      const view = render(<Greedy value={value} />);
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      expect(entries()).toEqual({});
      view.unmount();
    }

    // Plain text that merely starts with "data:" is still just text.
    const view = render(<Greedy value={{ note: "Data: pay on Friday" }} />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(Object.values(entries()).map((entry) => entry.value)).toEqual([
      { note: "Data: pay on Friday" },
    ]);
    view.unmount();
  });

  it("keeps drafts in memory only", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const view = render(<Field account={ALICE} />);
    type("not on disk");
    swapTo(view, "desktop", <Field account={ALICE} />);

    expect(setItem).not.toHaveBeenCalled();
    const onDisk = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index)!)),
    );
    expect(onDisk.join("\n")).not.toContain("not on disk");
    setItem.mockRestore();
  });

  it("clearViewDrafts leaves nothing for a sign-out or an account change", () => {
    const view = render(<Field account={ALICE} />);
    type("before sign-out");

    clearViewDrafts();
    swapTo(view, "desktop", <Field account={ALICE} />);

    expect(field().value).toBe("");
  });
});
