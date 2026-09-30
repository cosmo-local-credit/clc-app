import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { EllipsizedAddress, HighlightAddress } from "./wallet-address";

const ADDRESS = "0x111122223333444455556666777788889999aaaa";

describe("wallet address direction", () => {
  it("isolates full and shortened addresses as LTR inside RTL pages", () => {
    const { container } = render(
      <div dir="rtl">
        <HighlightAddress address={ADDRESS} />
        <EllipsizedAddress address={ADDRESS} />
      </div>,
    );

    const values = container.querySelectorAll("span[dir='ltr']");
    expect(values).toHaveLength(2);
    expect(values[0]?.textContent).toContain("0x1111");
    expect(values[1]?.textContent).toContain("0x1111");
  });
});
