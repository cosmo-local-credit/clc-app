import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { $getRoot, $getSelection, $selectAll, createEditor, type LexicalEditor } from "lexical";
import { describe, expect, it, vi } from "vite-plus/test";

import { MarkdownEditor } from "./markdown-editor";
import {
  MARKDOWN_EDITOR_NODES,
  MARKDOWN_TRANSFORMERS,
  MarkdownEditorLexical,
} from "./markdown-editor-lexical";

/**
 * The editor behind a mounted `contentEditable`.
 *
 * Lexical hangs itself off its own root element — it is how
 * `getNearestEditorFromDOMNode` finds an editor from a DOM event — and jsdom
 * has no caret to drive one with, so a test that needs a selection reaches for
 * the editor the same way.
 */
function editorOf(element: HTMLElement): LexicalEditor {
  return (element as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
}

function body(): HTMLElement {
  return screen.getByRole("textbox", { name: "Post text" });
}

/** What Lexical does on a keystroke, minus the `beforeinput` jsdom never sends. */
async function type(text: string) {
  const editor = editorOf(body());
  await act(async () => {
    editor.update(() => {
      $getRoot().selectEnd().insertText(text);
    });
  });
}

async function selectEverything() {
  const editor = editorOf(body());
  await act(async () => {
    editor.update(() => {
      $selectAll();
    });
  });
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function paste(text: string) {
  await act(async () => {
    fireEvent.paste(body(), {
      clipboardData: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? text : ""),
        types: ["text/plain"],
      },
    });
  });
}

describe("markdown round trips", () => {
  /**
   * The conversion on its own, with no DOM: what the editor stores is what it
   * was given, and a body written before the editor existed must survive being
   * opened in it.
   */
  function roundTrip(markdown: string): string {
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_NODES],
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
      },
      { discrete: true },
    );
    return editor.getEditorState().read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS));
  }

  it.each([
    ["headings", "# One\n\n## Two\n\n### Three"],
    ["bold, italic and both", "Some **bold** and *italic* and ***both***"],
    ["strikethrough", "A ~~struck~~ word"],
    ["inline code", "Use `npm run dev` here"],
    ["fenced code", "```js\nconst a = 1;\n```"],
    ["block quotes", "> A quotation\n\nAfter"],
    ["bulleted lists", "- one\n- two\n- three"],
    ["nested lists", "- one\n    - nested\n- two"],
    ["numbered lists", "1. one\n2. two"],
    ["links", "See [the docs](https://example.com/x) now"],
    ["a whole post", "# Title\n\nIntro **bold**.\n\n- a\n- b\n\n> quote\n\n`code`"],
  ])("keeps %s unchanged", (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  // None of these has a transformer, and none of them may be quietly dropped
  // either: they come back as the text they were written as.
  it.each([
    ["a table", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
    ["a horizontal rule", "Before\n\n---\n\nAfter"],
    ["an image", "![alt text](https://example.com/i.png)"],
  ])("does not delete %s", (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });
});

describe("editing", () => {
  it("shows the stored markdown without reporting it as an edit", async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(
        <MarkdownEditorLexical
          value={"## Heading\n\nSome **bold** text"}
          onChange={onChange}
          aria-label="Post text"
        />,
      );
    });

    expect(body().querySelector("h2")?.textContent).toBe("Heading");
    expect(body().querySelector("strong")?.textContent).toBe("bold");
    // Nothing was typed, so nothing is dirty and nothing was normalized.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits markdown as the body is written", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditorLexical value="" onChange={onChange} aria-label="Post text" />);

    await type("Market day went well");

    expect(onChange).toHaveBeenCalledWith("Market day went well");
  });

  it("takes a later value from outside without reporting it back", async () => {
    const onChange = vi.fn();
    const { rerender } = await act(async () =>
      render(<MarkdownEditorLexical value="first" onChange={onChange} aria-label="Post text" />),
    );

    await act(async () => {
      rerender(
        <MarkdownEditorLexical
          value={"## recovered draft"}
          onChange={onChange}
          aria-label="Post text"
        />,
      );
    });

    expect(body().querySelector("h2")?.textContent).toBe("recovered draft");
    expect(onChange).not.toHaveBeenCalled();
  });

  // The parent hands back the value it was just given. Re-importing it would
  // rebuild the document under the caret on every keystroke.
  it("ignores the value it just emitted", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MarkdownEditorLexical value="" onChange={onChange} aria-label="Post text" />,
    );

    await type("one");
    const before = body().innerHTML;
    await act(async () => {
      rerender(<MarkdownEditorLexical value="one" onChange={onChange} aria-label="Post text" />);
    });

    expect(body().innerHTML).toBe(before);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports a blur to the form", async () => {
    const onBlur = vi.fn();
    render(
      <MarkdownEditorLexical value="" onChange={vi.fn()} onBlur={onBlur} aria-label="Post text" />,
    );

    fireEvent.blur(body());

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("is not editable while disabled", async () => {
    await act(async () => {
      render(
        <MarkdownEditorLexical value="Locked" onChange={vi.fn()} disabled aria-label="Post text" />,
      );
    });

    expect(body().getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("button", { name: "Bold" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("toolbar", () => {
  it("names every control", async () => {
    await act(async () => {
      render(<MarkdownEditorLexical value="" onChange={vi.fn()} aria-label="Post text" />);
    });

    for (const name of [
      "Undo",
      "Redo",
      "Bold",
      "Italic",
      "Heading",
      "Bulleted list",
      "Numbered list",
      "Link",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("writes bold and italic into the markdown", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditorLexical value="hello" onChange={onChange} aria-label="Post text" />);

    await selectEverything();
    await press("Bold");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("**hello**");

    await press("Italic");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("***hello***");
  });

  it("shows which format the caret is in", async () => {
    render(<MarkdownEditorLexical value="hello" onChange={vi.fn()} aria-label="Post text" />);

    await selectEverything();
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("false");

    await press("Bold");
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
  });

  // `##`, not `#`: the screen title is the page's only h1.
  it("turns a paragraph into a heading and back", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditorLexical value="Title" onChange={onChange} aria-label="Post text" />);

    await selectEverything();
    await press("Heading");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("## Title");

    await press("Heading");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("Title");
  });

  it("makes bulleted and numbered lists", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditorLexical value={"one\n\ntwo"} onChange={onChange} aria-label="Post text" />,
    );

    await selectEverything();
    await press("Bulleted list");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("- one\n- two");

    await selectEverything();
    await press("Numbered list");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("1. one\n2. two");
  });

  it("undoes and redoes an edit", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditorLexical value="hello" onChange={onChange} aria-label="Post text" />);

    await type(" there");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("hello there");

    await press("Undo");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("hello");

    await press("Redo");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("hello there");
  });

  it("links the selection and unlinks it again", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditorLexical value="the docs" onChange={onChange} aria-label="Post text" />);

    await selectEverything();
    await press("Link");
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: "https://example.com/x" },
    });
    await press("Apply");

    expect(onChange.mock.calls.at(-1)?.[0]).toBe("[the docs](https://example.com/x)");

    await selectEverything();
    await press("Link");
    await press("Remove");

    expect(onChange.mock.calls.at(-1)?.[0]).toBe("the docs");
  });

  // The same rule `MarkdownContent` renders by, applied before the link is
  // stored rather than after it is read back.
  it("refuses a link the renderer would strip", async () => {
    render(<MarkdownEditorLexical value="the docs" onChange={vi.fn()} aria-label="Post text" />);

    await selectEverything();
    await press("Link");
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: "javascript:alert(1)" },
    });

    expect(screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(true);
  });

  it("has nothing to link with no selection", async () => {
    await act(async () => {
      render(<MarkdownEditorLexical value="hello" onChange={vi.fn()} aria-label="Post text" />);
    });

    expect(screen.getByRole("button", { name: "Link" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("the character limit", () => {
  it("refuses typing past it and keeps what fits", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditorLexical
        value="12345"
        onChange={onChange}
        maxLength={8}
        aria-label="Post text"
      />,
    );

    await type("678");
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("12345678");

    await type("9");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(body().textContent).toBe("12345678");
  });

  it("refuses a paste that would not fit", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditorLexical
        value="12345"
        onChange={onChange}
        maxLength={8}
        aria-label="Post text"
      />,
    );

    await act(async () => {
      editorOf(body()).update(() => {
        $getRoot().selectEnd();
      });
    });
    await paste("far too much text to fit");

    expect(onChange).not.toHaveBeenCalled();
    expect(body().textContent).toBe("12345");
  });

  // Limits move, and a body stored under the old one still has to be editable.
  it("lets an over-long body be shortened", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditorLexical
        value="far too long already"
        onChange={onChange}
        maxLength={8}
        aria-label="Post text"
      />,
    );

    await selectEverything();
    await act(async () => {
      editorOf(body()).update(() => {
        $getSelection()?.insertText("far too long");
      });
    });

    expect(onChange).toHaveBeenCalledWith("far too long");
  });

  // The limit is on what is stored, not on what is shown: four visible
  // characters are ten once the emphasis is written down.
  it("counts the markdown, not the visible text", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditorLexical
        value="word"
        onChange={onChange}
        maxLength={6}
        aria-label="Post text"
      />,
    );

    await selectEverything();
    await press("Bold");

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("the lazy shell", () => {
  it("holds the editor's box until the chunk lands", async () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} aria-label="Post text" />);

    expect(screen.getByText("Loading the editor…")).toBeTruthy();
    expect(await screen.findByRole("textbox", { name: "Post text" })).toBeTruthy();
  });
});
