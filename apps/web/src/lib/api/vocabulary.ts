import { createVocabularyClient } from "@clc/api/features/vocabulary/client";
import { clcHttp } from "./http";

export const vocabularyClient = createVocabularyClient(clcHttp);
