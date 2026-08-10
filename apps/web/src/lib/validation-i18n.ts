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
    case "Voucher name is required":
      return i18n._({
        id: "Voucher name is required",
        message: "Voucher name is required",
      });
    case "Voucher name must be 80 characters or fewer":
      return i18n._({
        id: "Voucher name must be 80 characters or fewer",
        message: "Voucher name must be 80 characters or fewer",
      });
    case "Voucher symbol is required":
      return i18n._({
        id: "Voucher symbol is required",
        message: "Voucher symbol is required",
      });
    case "Voucher symbol must be 6 characters or fewer":
      return i18n._({
        id: "Voucher symbol must be 6 characters or fewer",
        message: "Voucher symbol must be 6 characters or fewer",
      });
    case "Use only letters and numbers for the voucher symbol":
      return i18n._({
        id: "Use only letters and numbers for the voucher symbol",
        message: "Use only letters and numbers for the voucher symbol",
      });
    case "Voucher value must be greater than zero":
      return i18n._({
        id: "Voucher value must be greater than zero",
        message: "Voucher value must be greater than zero",
      });
    case "Voucher description is required":
      return i18n._({
        id: "Voucher description is required",
        message: "Voucher description is required",
      });
    case "Voucher description must be 500 characters or fewer":
      return i18n._({
        id: "Voucher description must be 500 characters or fewer",
        message: "Voucher description must be 500 characters or fewer",
      });
    case "Decimals must be a whole number from 0 to 18":
      return i18n._({
        id: "Decimals must be a whole number from 0 to 18",
        message: "Decimals must be a whole number from 0 to 18",
      });
    case "Choose an expiration date":
      return i18n._({
        id: "Choose an expiration date",
        message: "Choose an expiration date",
      });
    case "Expiration date must be in the future":
      return i18n._({
        id: "Expiration date must be in the future",
        message: "Expiration date must be in the future",
      });
    case "Accept the terms to publish your voucher":
      return i18n._({
        id: "Accept the terms to publish your voucher",
        message: "Accept the terms to publish your voucher",
      });
    default:
      return error;
  }
}
