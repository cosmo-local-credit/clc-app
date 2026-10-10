import { createCatalogsClient } from "@clc/api/features/catalogs/client";
import { clcHttp } from "./http";

export const catalogsClient = createCatalogsClient(clcHttp);
