import { describe, expect, it } from "vite-plus/test";

import { recentSendRecipients, type SendActivityRow } from "./recent-send-recipients";

const VIEWER = "0xabc0000000000000000000000000000000000123";
const AMINA = "0x1111000000000000000000000000000000000001";
const JOSH = "0x2222000000000000000000000000000000000002";

function row(overrides: Partial<SendActivityRow> = {}): SendActivityRow {
  return {
    direction: "OUT",
    success: true,
    recipientAddress: AMINA,
    dateBlock: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("recentSendRecipients", () => {
  it("keeps successful sends, newest distinct address first", () => {
    const recipients = recentSendRecipients(
      [
        row({ recipientAddress: JOSH, dateBlock: "2026-07-02T00:00:00Z" }),
        row({ recipientAddress: AMINA, dateBlock: "2026-07-03T00:00:00Z" }),
        row({ recipientAddress: AMINA.toLowerCase(), dateBlock: "2026-07-01T00:00:00Z" }),
        row({ direction: "IN", recipientAddress: JOSH, dateBlock: "2026-07-04T00:00:00Z" }),
        row({ success: false, recipientAddress: JOSH, dateBlock: "2026-07-05T00:00:00Z" }),
        row({ recipientAddress: VIEWER, dateBlock: "2026-07-06T00:00:00Z" }),
        row({ recipientAddress: "not-an-address", dateBlock: "2026-07-07T00:00:00Z" }),
      ],
      VIEWER,
    );

    expect(recipients).toEqual([AMINA, JOSH]);
  });

  it("stops after five people", () => {
    const recipients = recentSendRecipients(
      Array.from({ length: 6 }, (_, index) =>
        row({
          recipientAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
          dateBlock: `2026-07-0${index + 1}T00:00:00Z`,
        }),
      ),
      VIEWER,
    );

    expect(recipients).toHaveLength(5);
    expect(recipients[0]).toBe(`0x${"6".padStart(40, "0")}`);
  });
});
