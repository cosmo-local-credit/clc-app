import { z } from "zod";

export const locationSchema = z.object(
  {
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    locationName: z.string().trim().min(1).max(200),
    country: z.string().regex(/^[A-Z]{2}$/),
  },
  {
    error: (issue) => (issue.input === undefined ? "Choose a location" : "Invalid location"),
  },
);

export type LocationInput = z.infer<typeof locationSchema>;
