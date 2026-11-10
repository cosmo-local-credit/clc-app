import type { IconType } from "react-icons";
import {
  RiChat3Line,
  RiCustomerService2Line,
  RiExchange2Line,
  RiNotification3Line,
} from "react-icons/ri";

import type { ActivitySection } from "./activity-search";

/** The icon leading each Activity sub-tab, on the phone and the desktop alike. */
export const ACTIVITY_SECTION_ICONS: Record<ActivitySection, IconType> = {
  transactions: RiExchange2Line,
  messages: RiChat3Line,
  notifications: RiNotification3Line,
  helpdesk: RiCustomerService2Line,
};
