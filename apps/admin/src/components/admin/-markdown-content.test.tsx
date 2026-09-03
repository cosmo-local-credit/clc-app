import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { MarkdownContent } from "./markdown-content";

const FIXTURE = `# Harvest report

Twenty **members** took part. See the [ledger](https://ledger.example/august).

| Voucher | Bags |
| ------- | ---: |
| Sarafu  |   12 |

\`\`\`sh
git show 0xa1b2c3
\`\`\`
`;

describe("MarkdownContent", () => {
  it("renders semantic elements on the console scale", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);

    // The review page owns the h1 and h2.
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Harvest report");
    expect(container.querySelector("strong")?.textContent).toBe("members");
  });

  it("puts a wide table and a fenced block in their own scroll containers", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);

    expect(container.querySelector("table")?.parentElement?.className).toContain("overflow-x-auto");
    expect(container.querySelector("pre")?.className).toContain("overflow-x-auto");
  });

  it("marks an external link and gives it a visible focus ring", () => {
    const { container } = render(<MarkdownContent>{FIXTURE}</MarkdownContent>);
    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://ledger.example/august");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.className).toContain("focus-visible:ring-2");
  });

  // `allowHtml` is never passed here either.
  it("renders hostile raw HTML as text", () => {
    const { container } = render(
      <MarkdownContent>{'<script>alert(1)</script> <img src=x onerror="boom()">'}</MarkdownContent>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("drops the href of an obfuscated link the parser let through", () => {
    const { container } = render(<MarkdownContent>{"[e](java&#10;script:alert)"}</MarkdownContent>);
    expect(container.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  // Images live in report_images and are rendered by the media panel.
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
