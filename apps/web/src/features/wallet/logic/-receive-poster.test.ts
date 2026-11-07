import { describe, expect, it } from "vite-plus/test";

import { firstStrongDirection, receivePayLink, receivePosterIdentity } from "./receive-poster";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

describe("receivePayLink", () => {
  it("opens the amount step with only the address, on the serving origin", () => {
    expect(receivePayLink("https://test.cosmolocal.credit", ADDRESS)).toBe(
      `https://test.cosmolocal.credit/wallet/send/amount?recipient=${ADDRESS}`,
    );
  });
});

describe("receivePosterIdentity", () => {
  it("prints the name over the username and short address", () => {
    expect(
      receivePosterIdentity({ name: " Mohamed Sohail ", username: "sohail", address: ADDRESS }),
    ).toEqual({
      title: "Mohamed Sohail",
      titleIsCode: false,
      detail: "sohail · 0x1a3E18…73563d",
    });
  });

  it("drops a missing username from the detail line", () => {
    expect(receivePosterIdentity({ name: "Alice", username: null, address: ADDRESS }).detail).toBe(
      "0x1a3E18…73563d",
    );
  });

  it("titles a nameless wallet by its username, set as code", () => {
    expect(receivePosterIdentity({ name: "  ", username: "alice", address: ADDRESS })).toEqual({
      title: "alice",
      titleIsCode: true,
      detail: "0x1a3E18…73563d",
    });
  });

  it("falls back to the short address alone", () => {
    expect(receivePosterIdentity({ name: null, username: null, address: ADDRESS })).toEqual({
      title: "0x1a3E18…73563d",
      titleIsCode: true,
      detail: null,
    });
  });
});

describe("firstStrongDirection", () => {
  it("reads the first letter, past digits and punctuation", () => {
    expect(firstStrongDirection("محمد سهيل")).toBe("rtl");
    expect(firstStrongDirection("12 - محمد")).toBe("rtl");
    expect(firstStrongDirection("Alice محمد")).toBe("ltr");
    expect(firstStrongDirection("שלום")).toBe("rtl");
    expect(firstStrongDirection("1234")).toBe("ltr");
  });
});
