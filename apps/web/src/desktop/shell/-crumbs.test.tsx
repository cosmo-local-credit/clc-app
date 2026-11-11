import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderInShell } from "./-shell-test-router";
import { DeskCrumbs } from "./crumbs";

describe("DeskCrumbs", () => {
  it("is a labelled breadcrumb that marks where the person is", async () => {
    await renderInShell(
      <DeskCrumbs pathname="/market" search={{ scope: "pools" }} trail={null} />,
      "/market?scope=pools",
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Market" })).toBeTruthy();
    const here = within(nav).getByText("Pools");
    expect(here.getAttribute("aria-current")).toBe("page");
    expect(within(nav).queryByRole("link", { name: "Pools" })).toBeNull();
  });

  it("keeps the list view when it leaves for a list, as the sidebar does", async () => {
    const { router } = await renderInShell(
      <DeskCrumbs pathname="/vouchers/0xabc" search={{ view: "list" }} trail="Tea voucher" />,
      "/vouchers/0xabc?view=list",
    );
    const link = screen.getByRole("link", { name: "Vouchers" });
    expect(link.getAttribute("href")).toBe("/market?scope=vouchers&view=list");
    fireEvent.click(link);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/market");
    });
    expect(router.state.location.search).toMatchObject({ scope: "vouchers", view: "list" });
  });

  it("always sends a resource breadcrumb to its full-page list", async () => {
    const onMap = await renderInShell(
      <DeskCrumbs pathname="/vouchers/0xabc" search={{ view: "map" }} trail="Tea voucher" />,
      "/vouchers/0xabc?view=map",
    );
    expect(screen.getByRole("link", { name: "Vouchers" }).getAttribute("href")).toBe(
      "/market?scope=vouchers&view=list",
    );
    onMap.unmount();

    await renderInShell(
      <DeskCrumbs pathname="/vouchers/0xabc" search={{}} trail="Tea voucher" />,
      "/vouchers/0xabc",
    );
    expect(screen.getByRole("link", { name: "Vouchers" }).getAttribute("href")).toBe(
      "/market?scope=vouchers&view=list",
    );
  });

  it("always sends Market to the unified map", async () => {
    const inList = await renderInShell(
      <DeskCrumbs pathname="/market" search={{ scope: "offers", view: "list" }} trail={null} />,
      "/market?scope=offers&view=list",
    );
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("href")).toBe(
      "/?tab=market&view=map",
    );
    inList.unmount();

    await renderInShell(
      <DeskCrumbs pathname="/market" search={{ scope: "offers" }} trail={null} />,
      "/market?scope=offers",
    );
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("href")).toBe(
      "/?tab=market&view=map",
    );
  });
});
