import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { MarkdownContent } from "./markdown-content";

const FIXTURE = `# Harvest report

Twenty **members** took part, and _seven_ stayed late. ~~Six~~ eight bags.

- Sorting
- Weighing
  1. First batch
  2. Second batch

> Reported by the Wendo group.

| Voucher | Bags |
| ------- | ---: |
| Sarafu  |   12 |
| Kiriba  |    4 |

See the [full ledger](https://ledger.example/august) for totals.

\`\`\`sh
git show 0xa1b2c3
\`\`\`

Wallet: \`0x1111111111111111111111111111111111111111\`
`;

describe("MarkdownContent", () => {
  it("renders semantic elements for headings, emphasis, lists and quotes", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);

    // A body heading starts at h3: the screen title owns the h1.
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Harvest report");
    expect(container.querySelector("strong")?.textContent).toBe("members");
    expect(container.querySelector("em")?.textContent).toBe("seven");
    expect(container.querySelector("del")?.textContent).toBe("Six");
    expect(container.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("ol li")?.textContent).toBe("First batch");
    expect(container.querySelector("blockquote")?.textContent).toContain("Wendo group");
  });

  it("renders a GFM table inside a horizontal scroll container", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);
    const table = container.querySelector("table");

    expect(table).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    // The page body must never scroll sideways at 360px, so the table does.
    expect(table?.parentElement?.className).toContain("overflow-x-auto");
  });

  it("keeps an explicit link and marks it as leaving the app", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);
    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://ledger.example/august");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");
    // Keyboard users need to see where they are.
    expect(link?.className).toContain("focus-visible:ring-2");
  });

  it("wraps a fenced block and a long unbroken hash", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);
    const pre = container.querySelector("pre");

    expect(pre?.textContent).toContain("git show 0xa1b2c3");
    expect(pre?.className).toContain("overflow-x-auto");

    const inline = [...container.querySelectorAll("code")].find((code) =>
      code.textContent?.startsWith("0x1111"),
    );
    expect(inline?.className).toContain("[overflow-wrap:anywhere]");
  });

  // `allowHtml` is never passed, so raw HTML is escaped text: no element is
  // created, so no attribute on it can fire.
  it("renders hostile raw HTML as text rather than executing it", () => {
    const { container } = render(
      <MarkdownContent>
        {'<script>alert(1)</script>\n\nInline <img src=x onerror="boom()"> too.'}
      </MarkdownContent>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.innerHTML).toContain("&lt;img src=x onerror=");
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  // Two layers, and the test covers both. The parser drops a link whose scheme
  // it does not know, so these never become anchors at all.
  it("renders an executable-scheme link as plain text", () => {
    const { container } = render(
      <MarkdownContent>
        {[
          "[a](javascript:alert)",
          "[b](JaVaScRiPt:alert)",
          "[c](data:text/html;base64,PHNjcmlwdD4=)",
          "[d](vbscript:msgbox)",
        ].join("\n\n")}
      </MarkdownContent>,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toContain("a");
  });

  // An entity-obfuscated scheme does reach the anchor, which is why the mapping
  // does not rely on the parser alone.
  it("drops the href of an obfuscated link the parser let through", () => {
    const { container } = render(<MarkdownContent>{"[e](java&#10;script:alert)"}</MarkdownContent>);

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.hasAttribute("href")).toBe(false);
  });

  it("keeps relative and mailto links without a new tab", () => {
    const { container } = render(
      <MarkdownContent>
        {"[in app](/posts/4633) and [mail](mailto:someone@example.org)"}
      </MarkdownContent>,
    );

    const [inApp, mail] = [...container.querySelectorAll("a")];
    expect(inApp?.getAttribute("href")).toBe("/posts/4633");
    expect(inApp?.hasAttribute("target")).toBe(false);
    expect(mail?.getAttribute("href")).toBe("mailto:someone@example.org");
    expect(mail?.getAttribute("target")).toBe("_blank");
  });

  // Images live in report_images and are rendered by the gallery.
  it("renders nothing for a markdown image", () => {
    const { container } = render(
      <MarkdownContent>{"![Harvest](https://content.example/one.jpg)"}</MarkdownContent>,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("accepts a pre-parsed document so a deferred preview does not reparse", async () => {
    const { parseMarkdown } = await import("@tanstack/markdown/parser");
    const { container } = render(
      <MarkdownContent>{parseMarkdown("## Parsed once")}</MarkdownContent>,
    );

    expect(container.querySelector("h3")?.textContent).toBe("Parsed once");
  });
});
