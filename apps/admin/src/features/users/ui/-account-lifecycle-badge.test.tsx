import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { formatDate } from "#/lib/format";
import { AccountLifecycleBadge } from "./account-lifecycle-badge";

describe("AccountLifecycleBadge", () => {
  it("renders nothing for an active or unknown lifecycle", () => {
    const { container, rerender } = render(
      <AccountLifecycleBadge lifecycle="ACTIVE" closesAt={null} />,
    );
    expect(container.firstChild).toBeNull();
    rerender(<AccountLifecycleBadge lifecycle={undefined} closesAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the closing date of a retiring account", () => {
    render(
      <AccountLifecycleBadge lifecycle="RETIREMENT_SCHEDULED" closesAt="2027-05-11T10:00:00Z" />,
    );
    expect(
      screen.getByLabelText(
        `account lifecycle state retiring · closes ${formatDate("2027-05-11T10:00:00Z")}`,
      ),
    ).toBeTruthy();
  });

  it("shows a retiring account without a date plainly", () => {
    render(<AccountLifecycleBadge lifecycle="RETIREMENT_SCHEDULED" closesAt={null} />);
    expect(screen.getByLabelText("account lifecycle state retiring")).toBeTruthy();
  });

  it("marks accounts past retirement without a date", () => {
    render(<AccountLifecycleBadge lifecycle="ERASED" closesAt="2027-05-11T10:00:00Z" />);
    expect(screen.getByLabelText("account lifecycle state erased")).toBeTruthy();
  });
});
