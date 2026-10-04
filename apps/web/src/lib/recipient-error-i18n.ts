import { BackendApiError } from "@clc/api/client/errors";
import type { I18n } from "@lingui/core";
import { translateValidationError } from "./validation-i18n";

/** Translate identity errors without exposing the backend's English description. */
export function translateRecipientError(error: unknown, i18n: I18n): string | null {
  if (!(error instanceof BackendApiError)) return null;
  switch (error.description) {
    case "username or pool name is already in use":
    case "a pool with this name already exists":
      return i18n._({
        id: "That username or pool name is already taken",
        message: "That username or pool name is already taken",
      });
    case "name or symbol is already in use":
      return i18n._({
        id: "That name or symbol is already taken",
        message: "That name or symbol is already taken",
      });
    case "username must be 3–24 letters, digits or hyphens, with at least one letter and no edge hyphens":
      return translateValidationError("Username must be 3–24 letters, digits or hyphens", i18n);
    default:
      return null;
  }
}
