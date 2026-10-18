import { createOwnedVouchersClient } from "@clc/api/features/vouchers/owned-client";
import { clcHttp } from "./http";

export const ownedVouchersClient = createOwnedVouchersClient(clcHttp);
