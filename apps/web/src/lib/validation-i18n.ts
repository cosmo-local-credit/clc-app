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
    case "Choose a preferred currency":
      return i18n._({
        id: "Choose a preferred currency",
        message: "Choose a preferred currency",
      });
    case "Bio must be 500 characters or fewer":
      return i18n._({
        id: "Bio must be 500 characters or fewer",
        message: "Bio must be 500 characters or fewer",
      });
    case "Enter a valid website URL including https://":
      return i18n._({
        id: "Enter a valid website URL including https://",
        message: "Enter a valid website URL including https://",
      });
    case "Invalid location":
      return i18n._({
        id: "Invalid location",
        message: "Invalid location",
      });
    case "Display name is required":
      return i18n._({
        id: "Display name is required",
        message: "Display name is required",
      });
    case "Display name must be 120 characters or fewer":
      return i18n._({
        id: "Display name must be 120 characters or fewer",
        message: "Display name must be 120 characters or fewer",
      });
    case "Use letters and numbers, for example KES":
      return i18n._({
        id: "Use letters and numbers, for example KES",
        message: "Use letters and numbers, for example KES",
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
    case "Price must be greater than zero":
      return i18n._({
        id: "Price must be greater than zero",
        message: "Price must be greater than zero",
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
    case "Accept the PATH License to publish your voucher":
      return i18n._({
        id: "Accept the PATH License to publish your voucher",
        message: "Accept the PATH License to publish your voucher",
      });
    case "Pool name is required":
      return i18n._({
        id: "Pool name is required",
        message: "Pool name is required",
      });
    case "Pool name must be 80 characters or fewer":
      return i18n._({
        id: "Pool name must be 80 characters or fewer",
        message: "Pool name must be 80 characters or fewer",
      });
    case "Pool shortcode is required":
      return i18n._({
        id: "Pool shortcode is required",
        message: "Pool shortcode is required",
      });
    case "Pool shortcode must be 6 characters or fewer":
      return i18n._({
        id: "Pool shortcode must be 6 characters or fewer",
        message: "Pool shortcode must be 6 characters or fewer",
      });
    case "Use only letters and numbers for the pool shortcode":
      return i18n._({
        id: "Use only letters and numbers for the pool shortcode",
        message: "Use only letters and numbers for the pool shortcode",
      });
    case "Pool description is required":
      return i18n._({
        id: "Pool description is required",
        message: "Pool description is required",
      });
    case "Pool description must be 500 characters or fewer":
      return i18n._({
        id: "Pool description must be 500 characters or fewer",
        message: "Pool description must be 500 characters or fewer",
      });
    case "Swap fee must be a number from 0 to 100":
      return i18n._({
        id: "Swap fee must be a number from 0 to 100",
        message: "Swap fee must be a number from 0 to 100",
      });
    case "Accept the terms to publish your pool":
      return i18n._({
        id: "Accept the terms to publish your pool",
        message: "Accept the terms to publish your pool",
      });
    case "Accept the SPROUT License to publish your pool":
      return i18n._({
        id: "Accept the SPROUT License to publish your pool",
        message: "Accept the SPROUT License to publish your pool",
      });
    case "Choose rates you set or equal value when the unit has no price feed":
      return i18n._({
        id: "Choose rates you set or equal value when the unit has no price feed",
        message: "Choose rates you set or equal value when the unit has no price feed",
      });
    case "Supply must be greater than zero":
      return i18n._({
        id: "Supply must be greater than zero",
        message: "Supply must be greater than zero",
      });
    case "Supply has more decimal places than this voucher supports":
      return i18n._({
        id: "Supply has more decimal places than this voucher supports",
        message: "Supply has more decimal places than this voucher supports",
      });
    case "Message must be 500 characters or fewer":
      return i18n._({
        id: "Message must be 500 characters or fewer",
        message: "Message must be 500 characters or fewer",
      });
    case "Add a message or choose profile details":
      return i18n._({
        id: "Add a message or choose profile details",
        message: "Add a message or choose profile details",
      });
    // Post authoring. Every message the report write schema can produce; a
    // missing case falls through to English for every locale.
    case "Enter a title for your post":
      return i18n._({
        id: "Enter a title for your post",
        message: "Enter a title for your post",
      });
    case "Title must be 200 characters or fewer":
      return i18n._({
        id: "Title must be 200 characters or fewer",
        message: "Title must be 200 characters or fewer",
      });
    case "Post text is too long":
      return i18n._({
        id: "Post text is too long",
        message: "Post text is too long",
      });
    case "Summary must be 10,000 characters or fewer":
      return i18n._({
        id: "Summary must be 10,000 characters or fewer",
        message: "Summary must be 10,000 characters or fewer",
      });
    case "Media must be an uploaded http(s) URL":
      return i18n._({
        id: "Media must be an uploaded http(s) URL",
        message: "Media must be an uploaded http(s) URL",
      });
    case "Latitude must be between -90 and 90":
      return i18n._({
        id: "Latitude must be between -90 and 90",
        message: "Latitude must be between -90 and 90",
      });
    case "Longitude must be between -180 and 180":
      return i18n._({
        id: "Longitude must be between -180 and 180",
        message: "Longitude must be between -180 and 180",
      });
    case "Enter a valid date and time":
      return i18n._({
        id: "Enter a valid date and time",
        message: "Enter a valid date and time",
      });
    case "Choose a voucher":
      return i18n._({
        id: "Choose a voucher",
        message: "Choose a voucher",
      });
    case "Caption must be 500 characters or fewer":
      return i18n._({
        id: "Caption must be 500 characters or fewer",
        message: "Caption must be 500 characters or fewer",
      });
    case "Choose a file or an embed":
      return i18n._({
        id: "Choose a file or an embed",
        message: "Choose a file or an embed",
      });
    case "File name must be 255 characters or fewer":
      return i18n._({
        id: "File name must be 255 characters or fewer",
        message: "File name must be 255 characters or fewer",
      });
    case "Host must be 200 characters or fewer":
      return i18n._({
        id: "Host must be 200 characters or fewer",
        message: "Host must be 200 characters or fewer",
      });
    case "Participants must be 100 characters or fewer":
      return i18n._({
        id: "Participants must be 100 characters or fewer",
        message: "Participants must be 100 characters or fewer",
      });
    case "Duration must be 100 characters or fewer":
      return i18n._({
        id: "Duration must be 100 characters or fewer",
        message: "Duration must be 100 characters or fewer",
      });
    case "Tags must not be blank":
      return i18n._({
        id: "Tags must not be blank",
        message: "Tags must not be blank",
      });
    case "Tags must be 100 characters or fewer":
      return i18n._({
        id: "Tags must be 100 characters or fewer",
        message: "Tags must be 100 characters or fewer",
      });
    case "Choose at most 12 tags":
      return i18n._({
        id: "Choose at most 12 tags",
        message: "Choose at most 12 tags",
      });
    case "Link at most 12 vouchers":
      return i18n._({
        id: "Link at most 12 vouchers",
        message: "Link at most 12 vouchers",
      });
    case "Add at most 50 images":
      return i18n._({
        id: "Add at most 50 images",
        message: "Add at most 50 images",
      });
    case "Add at most 20 attachments":
      return i18n._({
        id: "Add at most 20 attachments",
        message: "Add at most 20 attachments",
      });
    case "Choose a place on the map or clear it":
      return i18n._({
        id: "Choose a place on the map or clear it",
        message: "Choose a place on the map or clear it",
      });
    case "The end of the period must not be before its start":
      return i18n._({
        id: "The end of the period must not be before its start",
        message: "The end of the period must not be before its start",
      });
    case "Each tag can only be added once":
      return i18n._({
        id: "Each tag can only be added once",
        message: "Each tag can only be added once",
      });
    case "Each voucher can only be linked once":
      return i18n._({
        id: "Each voucher can only be linked once",
        message: "Each voucher can only be linked once",
      });
    case "Each image can only be added once":
      return i18n._({
        id: "Each image can only be added once",
        message: "Each image can only be added once",
      });
    case "Each attachment can only be added once":
      return i18n._({
        id: "Each attachment can only be added once",
        message: "Each attachment can only be added once",
      });
    default:
      return error;
  }
}
