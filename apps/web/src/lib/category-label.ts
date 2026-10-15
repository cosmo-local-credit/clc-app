import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Translate display labels only. API filters and custom vocabulary keep their values.
const categoryMessages: Record<string, MessageDescriptor> = {
  agriculture: msg`Agriculture`,
  care: msg`Care`,
  construction: msg`Construction`,
  cleaning: msg`Cleaning`,
  education: msg`Education`,
  elders: msg`Elders`,
  endowments: msg`Endowments`,
  fellowship: msg`Fellowship`,
  gathering: msg`Gathering`,
  handcrafts: msg`Handcrafts`,
  housekeeping: msg`Housekeeping`,
  lending: msg`Lending`,
  market: msg`Market`,
  outreach: msg`Outreach`,
  software: msg`Software`,
  "tree planting": msg`Tree Planting`,
  training: msg`Training`,
  volunteer: msg`Volunteer`,
  "water catchment": msg`Water Catchment`,
  youth: msg`Youth`,
  other: msg`Other`,
  art: msg`Art`,
  biodiversity: msg`Biodiversity`,
  celebration: msg`Celebration`,
  collaboration: msg`Collaboration`,
  "common spaces": msg`Common Spaces`,
  culture: msg`Culture`,
  ecovillage: msg`Ecovillage`,
  festivals: msg`Festivals`,
  "food processing": msg`Food Processing`,
  "food production": msg`Food production`,
  "house building": msg`House building`,
  mobility: msg`Mobility`,
  "natural building": msg`Natural building`,
  permaculture: msg`Permaculture`,
  "plant nursery": msg`Plant Nursery`,
  "regenerative agriculture": msg`Regenerative Agriculture`,
  rehabilitation: msg`Rehabilitation`,
  retreat: msg`Retreat`,
  sociocracy: msg`Sociocracy`,
  "soil health": msg`Soil Health`,
  "solar energy": msg`Solar Energy`,
  storytelling: msg`Storytelling`,
  handmade: msg`Handmade`,
};

export function categoryLabel(tag: string, i18n: I18n): string {
  const key = tag.toLowerCase();
  const message = Object.hasOwn(categoryMessages, key) ? categoryMessages[key] : undefined;
  return message ? i18n._(message) : tag;
}
