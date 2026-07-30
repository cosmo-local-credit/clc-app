import type { I18n } from "@lingui/core";

export function translateValidationError(error: string, i18n: I18n) {
  switch (error) {
    case "Name is required":
      return i18n._({ id: "Name is required", message: "Name is required" });
    case "Name must be 80 characters or fewer":
      return i18n._({
        id: "Name must be 80 characters or fewer",
        message: "Name must be 80 characters or fewer",
      });
    case "Invalid email address":
      return i18n._({
        id: "Invalid email address",
        message: "Invalid email address",
      });
    case "Invalid phone number":
      return i18n._({
        id: "Invalid phone number",
        message: "Invalid phone number",
      });
    case "ENS must end in .eth or .sarafu.eth":
      return i18n._({
        id: "ENS must end in .eth or .sarafu.eth",
        message: "ENS must end in .eth or .sarafu.eth",
      });
    case "Provide an email or phone number":
      return i18n._({
        id: "Provide an email or phone number",
        message: "Provide an email or phone number",
      });
    case "Choose a location":
      return i18n._({
        id: "Choose a location",
        message: "Choose a location",
      });
    case "Invalid location":
      return i18n._({
        id: "Invalid location",
        message: "Invalid location",
      });
    default:
      return error;
  }
}
