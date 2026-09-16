import { z } from "zod";

/**
 * A stored image URL, or nothing.
 *
 * The picker uploads on selection, so by the time a value reaches a form it is
 * already an `http(s)` URL from storage-server or an empty string. clc-core
 * validates the same shape before queueing a deploy — the catalog column that
 * receives it refuses anything else, and by then the transaction is signed — so
 * a malformed value has to be caught here rather than in the worker.
 */
export const optionalStoredImageUrlSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\//i.test(value), {
    message: "The image must be an http(s) URL",
  })
  .optional();
