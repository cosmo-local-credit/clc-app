import { createSymbolsClient } from "@clc/api/features/symbols/client";

import { clcHttp } from "./http";

export const symbolsClient = createSymbolsClient(clcHttp);
