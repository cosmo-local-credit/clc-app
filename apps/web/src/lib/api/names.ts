import { createNamesClient } from "@clc/api/features/names/client";

import { clcHttp } from "./http";

export const namesClient = createNamesClient(clcHttp);
