import { createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, it } from "vite-plus/test";
import {
  beginVoucherCreateHistory,
  exitVoucherCreateHistory,
  resetVoucherCreateHistory,
} from "./voucher-create-history";

function waitForPath(history: ReturnType<typeof createMemoryHistory>, pathname: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${pathname}`));
    }, 1_500);
    const check = () => {
      if (history.location.pathname !== pathname) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    };
    const unsubscribe = history.subscribe(check);
    check();
  });
}

afterEach(() => resetVoucherCreateHistory());

describe("voucher create history", () => {
  it("discards all form steps when a terminal receipt exits", async () => {
    const history = createMemoryHistory({ initialEntries: ["/wallet/vouchers"] });
    history.push("/vouchers/create/voucher");
    history.flush();
    beginVoucherCreateHistory(history);
    history.push("/vouchers/create/place");
    history.push("/vouchers/create/review");
    history.flush();

    exitVoucherCreateHistory({
      history,
      destination: "/vouchers/create/receipt?trackingId=tracking-1",
    });
    await waitForPath(history, "/vouchers/create/receipt");

    exitVoucherCreateHistory({ history, destination: "/vouchers/0x123?from=vouchers" });
    await waitForPath(history, "/vouchers/0x123");

    history.back();
    history.flush();
    await waitForPath(history, "/wallet/vouchers");
  });

  it("replaces a deep-linked receipt when no form root was recorded", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/vouchers/create/receipt?trackingId=tracking-1"],
    });

    exitVoucherCreateHistory({ history, destination: "/wallet/vouchers" });
    await waitForPath(history, "/wallet/vouchers");
  });
});
