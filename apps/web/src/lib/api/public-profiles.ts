import { createPublicProfilesClient } from "@clc/api/features/public-profiles/client";
import { clcHttp } from "./http";

export const publicProfilesClient = createPublicProfilesClient(clcHttp);
