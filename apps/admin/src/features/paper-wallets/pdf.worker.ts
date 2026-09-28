import { assemblePaperWalletPdf, type PreparedCard } from "./pdf-assembly";

type Request = { cards: PreparedCard[]; hairlines: boolean };
type Reply = { ok: true; pdf: Blob } | { ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply): void;
};

scope.onmessage = (event) => {
  try {
    scope.postMessage({
      ok: true,
      pdf: assemblePaperWalletPdf(event.data.cards, event.data.hairlines),
    });
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "The PDF could not be assembled",
    });
  }
};
