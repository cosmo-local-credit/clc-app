import { createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, it } from "vite-plus/test";
import {
  beginPoolCreateHistory,
  exitPoolCreateHistory,
  resetPoolCreateHistory,
} from "./pool-create-history";

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

afterEach(() => resetPoolCreateHistory());

describe("pool create history", () => {
  it("discards every form step when the receipt exits to the deployed pool", async () => {
    const history = createMemoryHistory({ initialEntries: ["/pools"] });
    history.push("/pools/create/pool");
    history.flush();
    beginPoolCreateHistory(history);
    history.push("/pools/create/place");
    history.push("/pools/create/review");
    history.flush();

    exitPoolCreateHistory({
      history,
      destination: "/pools/create/receipt?trackingId=tracking-1",
    });
    await waitForPath(history, "/pools/create/receipt");

    exitPoolCreateHistory({ history, destination: "/pools/0x123" });
    await waitForPath(history, "/pools/0x123");

    history.back();
    history.flush();
    await waitForPath(history, "/pools");
  });

  it("replaces a failed receipt with review for a draft retry", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/pools/create/receipt?trackingId=tracking-1"],
    });

    exitPoolCreateHistory({ history, destination: "/pools/create/review" });
    await waitForPath(history, "/pools/create/review");
  });
});
