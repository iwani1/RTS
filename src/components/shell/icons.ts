"use client";

import {
  Banknote,
  BarChart3,
  Bus,
  CalendarCheck,
  ClipboardList,
  FileText,
  Gauge,
  Headphones,
  LayoutDashboard,
  Map,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "./nav-config";

/**
 * The icon registry. Lucide, 1.5px stroke, no emoji anywhere in the product.
 */
export const ICONS: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  gauge: Gauge,
  bus: Bus,
  calendar: CalendarCheck,
  map: Map,
  users: Users,
  pin: MapPin,
  truck: Truck,
  "user-cog": UserCog,
  shield: ShieldAlert,
  banknote: Banknote,
  chart: BarChart3,
  scroll: ScrollText,
  settings: Settings,
  headset: Headphones,
  clipboard: ClipboardList,
  file: FileText,
};
