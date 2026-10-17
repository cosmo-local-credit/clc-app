import { safeMarkdownHref } from "@clc/core/features/reports/logic";
import { CodeHighlightNode, CodeNode } from "@lexical/code-core";
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type Transformer,
} from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $createHeadingNode, $isHeadingNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type EditorState,
  type EditorThemeClasses,
  type Klass,
  type LexicalNode,
} from "lexical";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type ReactNode,
} from "react";
import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiBold,
  RiH2,
  RiItalic,
  RiLink,
  RiListOrdered,
  RiListUnordered,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Toggle } from "#/components/ui/toggle";
import { cn } from "#/lib/utils";

export type MarkdownEditorProps = {
  /** Markdown, never HTML and never a serialized editor state. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  id?: string;
  /** Measured against the serialized Markdown, not against the visible text. */
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/**
 * Every node the transformers below can produce. A transformer whose node is
 * missing here throws on import, so the two lists move together.
 */
export const MARKDOWN_EDITOR_NODES: readonly Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  ListNode,
  ListItemNode,
  LinkNode,
];

/**
 * The stock set: headings, quotes, fenced code, lists, inline code, bold,
 * italic, strikethrough, highlight and links.
 *
 * Deliberately not `DEFAULT_TRANSFORMERS` from `MarkdownShortcutPlugin`, which
 * adds a horizontal rule on `---` and so needs a decorator node this editor
 * does not register. Left out, `---` is imported as a paragraph holding that
 * text and exported unchanged.
 *
 * The same is true of anything else an older body holds — a table, an image.
 * Lines that match no transformer become paragraph text, and adjacent ones are
 * joined by line breaks that export as the single newlines they arrived as. A
 * table stops being a table in the editor; it does not stop being a table in
 * the stored Markdown.
 */
export const MARKDOWN_TRANSFORMERS: Transformer[] = TRANSFORMERS;

/**
 * The type scale of a written body, mirroring `MarkdownContent` so what is
 * typed looks like what is published. `h1` and `h2` share a size there because
 * the screen title is the page's only real `h1`.
 */
const editorTheme: EditorThemeClasses = {
  code: "my-3 block overflow-x-auto whitespace-pre-wrap border border-border bg-muted p-3 font-mono text-sm leading-5",
  heading: {
    h1: "mt-4 font-heading text-lg font-semibold leading-snug",
    h2: "mt-4 font-heading text-lg font-semibold leading-snug",
    h3: "mt-3 font-heading text-base font-semibold leading-snug",
    h4: "mt-3 font-heading text-sm font-semibold leading-snug",
    h5: "mt-3 font-heading text-sm font-semibold leading-snug",
    h6: "mt-3 font-heading text-sm font-semibold leading-snug",
  },
  link: "font-medium text-primary underline underline-offset-2",
  list: {
    listitem: "leading-6 [overflow-wrap:anywhere]",
    nested: { listitem: "list-none" },
    ol: "my-2 list-decimal space-y-1 ps-5",
    ul: "my-2 list-disc space-y-1 ps-5",
  },
  paragraph: "leading-6 [overflow-wrap:anywhere]",
  quote: "my-2 border-s-2 border-border ps-3 text-muted-foreground",
  text: {
    bold: "font-semibold",
    code: "bg-muted px-1 py-0.5 font-mono text-sm",
    italic: "italic",
    strikethrough: "line-through",
  },
};

/** Only the schemes `MarkdownContent` will render as a link are worth storing. */
function isLinkableUrl(url: string): boolean {
  return safeMarkdownHref(url) !== undefined;
}

/**
 * A Markdown body, edited through a toolbar instead of by hand.
 *
 * Markdown stays the only format that crosses this boundary: `value` arrives as
 * Markdown, `onChange` emits Markdown, and the editor state in between is never
 * persisted. Nothing downstream — drafts, schemas, the API, `MarkdownContent` —
 * knows Lexical is here.
 */
export function MarkdownEditorLexical(props: MarkdownEditorProps) {
  const { t } = useLingui();
  const { id, placeholder, disabled = false, onBlur } = props;
  const placeholderText = placeholder ?? t`Write here`;

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "clc-markdown",
        nodes: [...MARKDOWN_EDITOR_NODES],
        theme: editorTheme,
        editable: !disabled,
        // `value` is imported by `MarkdownBridge` instead of through
        // `initialConfig.editorState`, which would run before anything is
        // listening and leave the first import indistinguishable from the first
        // edit. See the flags there.
        onError: (error: Error) => {
          throw error;
        },
      }}
    >
      <div
        className={cn(
          "flex flex-col border border-border bg-card",
          "focus-within:border-foreground",
          props["aria-invalid"] ? "border-destructive" : undefined,
          disabled ? "pointer-events-none opacity-50" : undefined,
        )}
      >
        <MarkdownToolbar disabled={disabled} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                dir="auto"
                id={id}
                aria-label={props["aria-label"]}
                aria-labelledby={props["aria-labelledby"]}
                aria-invalid={props["aria-invalid"]}
                aria-multiline
                aria-placeholder={placeholderText}
                placeholder={
                  <p className="pointer-events-none absolute top-2 start-3 text-muted-foreground text-sm">
                    {placeholderText}
                  </p>
                }
                onBlur={onBlur}
                className="min-h-40 w-full px-3 py-2 text-sm outline-none [&>*:first-child]:mt-0"
              />
            }
            // The placeholder above is positioned against this box instead.
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={isLinkableUrl} />
        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
        {/* Last, and load-bearing. React runs effects in tree order, and the
            import below is one: with history registered above it, history sees
            the imported document as the state to undo back to. Below it, it
            would not, and the first edit would have nothing to undo. */}
        <MarkdownBridge
          value={props.value}
          onChange={props.onChange}
          maxLength={props.maxLength}
          disabled={disabled}
        />
      </div>
    </LexicalComposer>
  );
}

/**
 * The only place the editor state and the Markdown string meet.
 *
 * Two directions, each guarded against the other. Outward: serialize on every
 * user edit and hand the string up. Inward: re-import only a `value` this
 * editor did not itself produce, so a controlled parent re-rendering with the
 * value it was just handed is a no-op rather than a cursor reset.
 */
function MarkdownBridge({
  value,
  onChange,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  // What this editor last put on the wire, and so what an arriving `value` is
  // compared against.
  const emittedRef = useRef(value);
  // The last state whose Markdown was within `maxLength`, restored when an edit
  // would push it over.
  const acceptedRef = useRef<EditorState | null>(null);
  // Whether `value` has been written into the editor yet. Until it has, the
  // document is Lexical's own empty paragraph, which is not the user clearing
  // the field.
  const importedRef = useRef(false);
  // Whether the write in progress is this component's. Everything it writes
  // came from `value`, so none of it is an edit to report back.
  //
  // Both flags are read rather than `OnChangePlugin`'s `history-merge`
  // filtering, which cannot tell an import from the first edit after one: the
  // tag from a commit Lexical has not flushed yet rides along on it.
  const applyingRef = useRef(false);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Passive, and so after `HistoryPlugin` has registered — `registerHistory`
  // only starts tracking on the first commit it sees, and an import it missed
  // would leave the first edit with nothing to undo back to. The cost is the
  // empty paragraph Lexical mounts with being on screen for a frame, which is
  // the same box the lazy fallback was already showing.
  useEffect(() => {
    if (importedRef.current && value === emittedRef.current) {
      acceptedRef.current = editor.getEditorState();
      return;
    }

    importedRef.current = true;
    emittedRef.current = value;
    applyingRef.current = true;
    editor.update(
      () => {
        $convertFromMarkdownString(value, MARKDOWN_TRANSFORMERS);
      },
      // Discrete so the commit — and the listener below — happen before the
      // flag is lowered, and merged so an import is not an undo step.
      { discrete: true, tag: "history-merge" },
    );
    applyingRef.current = false;
    acceptedRef.current = editor.getEditorState();
  }, [editor, value]);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      if (applyingRef.current || !importedRef.current) return;
      const markdown = editorState.read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS));

      // The refusal a textarea's `maxLength` gives, measured on what is
      // actually stored. An edit that shortens an already-too-long body is let
      // through, or a legacy body could never be brought back under the limit.
      if (
        maxLength !== undefined &&
        markdown.length > maxLength &&
        markdown.length > emittedRef.current.length
      ) {
        const accepted = acceptedRef.current;
        // After this listener, not inside it: the commit that produced this
        // state is still being announced, and replacing it from here is a write
        // in the middle of a read.
        if (accepted !== null) {
          queueMicrotask(() => editor.setEditorState(accepted, { tag: "history-merge" }));
        }
        return;
      }

      acceptedRef.current = editorState;
      if (markdown === emittedRef.current) return;
      emittedRef.current = markdown;
      onChange(markdown);
    },
    [editor, maxLength, onChange],
  );

  // The tag filtering is off on purpose: the two flags above decide what
  // counts as an edit, and two mechanisms would only disagree.
  return <OnChangePlugin ignoreHistoryMergeTagChange={false} onChange={handleChange} />;
}

type BlockType = "paragraph" | "heading" | "ul" | "ol";

/** What the selection is, as the toolbar needs to show it. */
type SelectionState = {
  block: BlockType;
  bold: boolean;
  /** A collapsed caret outside a link has nothing to turn into one. */
  canLink: boolean;
  italic: boolean;
  link: boolean;
};

const initialSelectionState: SelectionState = {
  block: "paragraph",
  bold: false,
  canLink: false,
  italic: false,
  link: false,
};

/**
 * One scrolling row of controls.
 *
 * It scrolls rather than wraps or shrinks: at 360px a wrapping toolbar changes
 * the editor's height as the selection moves, and shrunken controls fall under
 * the 44px touch target.
 */
function MarkdownToolbar({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const { t } = useLingui();
  const [state, setState] = useState<SelectionState>(initialSelectionState);
  const [history, setHistory] = useState({ canRedo: false, canUndo: false });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputId = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Read whole, then stored. Every node method here needs an active editor
  // state, and a `setState` updater runs when React gets round to it — long
  // after the read this was called inside has ended.
  const readSelection = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setState(initialSelectionState);
      return;
    }

    const ancestry = [selection.anchor.getNode(), ...selection.anchor.getNode().getParents()];
    const link = ancestry.find((node) => $isLinkNode(node));
    const list = ancestry.find((node) => $isListNode(node));
    const heading = ancestry.find((node) => $isHeadingNode(node));

    setState({
      block: $isListNode(list)
        ? list.getListType() === "number"
          ? "ol"
          : "ul"
        : heading !== undefined
          ? "heading"
          : "paragraph",
      bold: selection.hasFormat("bold"),
      canLink: !selection.isCollapsed() || link !== undefined,
      italic: selection.hasFormat("italic"),
      link: link !== undefined,
    });
  }, []);

  useEffect(() => {
    const teardowns = [
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(readSelection);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          readSelection();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (canUndo) => {
          setHistory((current) => ({ ...current, canUndo }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (canRedo) => {
          setHistory((current) => ({ ...current, canRedo }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];
    return () => {
      for (const teardown of teardowns) teardown();
    };
  }, [editor, readSelection]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  /**
   * Paragraph and heading, not a level picker. The screen title is the page's
   * only `h1` and `MarkdownContent` renders `#` and `##` at one size, so a body
   * heading is `##` and there is nothing left to choose.
   */
  const toggleHeading = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        state.block === "heading" ? $createParagraphNode() : $createHeadingNode("h2"),
      );
    });
  };

  const toggleList = (type: "ul" | "ol") => {
    if (state.block === type) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(
      type === "ol" ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
      undefined,
    );
  };

  const toggleLinkRow = () => {
    if (linkOpen) {
      setLinkOpen(false);
      return;
    }
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchor = selection.anchor.getNode();
      const link = [anchor, ...anchor.getParents()].find((node) => $isLinkNode(node));
      setLinkUrl($isLinkNode(link) ? link.getURL() : "");
    });
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!isLinkableUrl(url)) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    setLinkOpen(false);
  };

  return (
    <div className="border-border border-b">
      {/* Abutting, and scrolling. Eight 44px targets do not fit 360px, so the
          last one is meant to be partly in view: that overhang is the only hint
          that the row scrolls, and gaps between them would push it out of sight
          altogether. */}
      <div className="flex items-center overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolbarButton
          label={t`Undo`}
          disabled={disabled || !history.canUndo}
          onPress={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <RiArrowGoBackLine aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Redo`}
          disabled={disabled || !history.canRedo}
          onPress={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <RiArrowGoForwardLine aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Bold`}
          pressed={state.bold}
          disabled={disabled}
          onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        >
          <RiBold aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Italic`}
          pressed={state.italic}
          disabled={disabled}
          onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        >
          <RiItalic aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Heading`}
          pressed={state.block === "heading"}
          disabled={disabled}
          onPress={toggleHeading}
        >
          <RiH2 aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Bulleted list`}
          pressed={state.block === "ul"}
          disabled={disabled}
          onPress={() => toggleList("ul")}
        >
          <RiListUnordered aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Numbered list`}
          pressed={state.block === "ol"}
          disabled={disabled}
          onPress={() => toggleList("ol")}
        >
          <RiListOrdered aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t`Link`}
          pressed={linkOpen || state.link}
          disabled={disabled || !state.canLink}
          onPress={toggleLinkRow}
        >
          <RiLink aria-hidden />
        </ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-1.5 border-border border-t p-1">
          <label htmlFor={linkInputId} className="sr-only">
            <Trans>Link address</Trans>
          </label>
          <Input
            id={linkInputId}
            ref={linkInputRef}
            dir="ltr"
            type="url"
            inputMode="url"
            value={linkUrl}
            placeholder="https://example.com"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyLink();
            }}
          />
          <Button type="button" tap onClick={applyLink} disabled={!isLinkableUrl(linkUrl)}>
            <Trans>Apply</Trans>
          </Button>
          {state.link ? (
            <Button
              type="button"
              variant="outline"
              tap
              onClick={() => {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
                setLinkOpen(false);
              }}
            >
              <Trans>Remove</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * `onMouseDown` is swallowed so the pointer never leaves the editable: a
 * toolbar press that took focus would collapse the very selection it is about
 * to format. Keyboard activation is untouched.
 */
function ToolbarButton({
  label,
  pressed = false,
  disabled,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Toggle
      size="icon"
      aria-label={label}
      pressed={pressed}
      disabled={disabled}
      // Pressed has to read as more than hovered — the shared `Toggle` gives
      // both the same muted fill — because on a toolbar it is state, not
      // feedback.
      className="data-[pressed]:bg-primary/10 data-[pressed]:text-primary"
      onMouseDown={(event) => event.preventDefault()}
      onPressedChange={onPress}
    >
      {children}
    </Toggle>
  );
}
