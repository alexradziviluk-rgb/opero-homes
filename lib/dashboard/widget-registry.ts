import type { ComponentType } from "react";
import type { Permission } from "@/types/user";

import PropertiesWidget from "@/components/dashboard/widgets/PropertiesWidget";
import BookingsWidget from "@/components/dashboard/widgets/BookingsWidget";
import RevenueWidget from "@/components/dashboard/widgets/RevenueWidget";
import OccupancyWidget from "@/components/dashboard/widgets/OccupancyWidget";
import CheckoutPaymentsWidget from "@/components/dashboard/widgets/CheckoutPaymentsWidget";
import TodayArrivalsWidget from "@/components/dashboard/widgets/TodayArrivalsWidget";
import TodayDeparturesWidget from "@/components/dashboard/widgets/TodayDeparturesWidget";
import UrgentTasksWidget from "@/components/dashboard/widgets/UrgentTasksWidget";
import PendingConfirmationsWidget from "@/components/dashboard/widgets/PendingConfirmationsWidget";

export type DashboardWidgetCategory =
  | "finance"
  | "analytics"
  | "operations"
  | "bookings"
  | "payments"
  | "tasks"
  | "cleaning"
  | "maintenance"
  | "guest";

export type DashboardWidgetId =
  | "properties"
  | "bookings"
  | "revenue"
  | "occupancy"
  | "checkout-payments"
  | "today-arrivals"
  | "today-departures"
  | "urgent-tasks"
  | "pending-confirmations";

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  category: DashboardWidgetCategory;
  requiredPermissions: Permission[];
  order: number;
  size?: "small" | "medium" | "large";
  anyOfPermissions?: Permission[];
}

const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  {
    id: "properties",
    title: "Объекты",
    category: "operations",
    requiredPermissions: ["operations.view", "properties.view"],
    order: 10,
    size: "small",
  },
  {
    id: "bookings",
    title: "Бронирования",
    category: "bookings",
    requiredPermissions: ["bookings.view"],
    order: 20,
    size: "small",
  },
  {
    id: "revenue",
    title: "Доход за месяц",
    category: "finance",
    requiredPermissions: ["finance.view"],
    order: 30,
    size: "small",
  },
  {
    id: "occupancy",
    title: "Заполняемость",
    category: "analytics",
    requiredPermissions: ["analytics.view"],
    order: 40,
    size: "small",
  },
  {
    id: "checkout-payments",
    title: "К оплате при выезде",
    category: "payments",
    requiredPermissions: [],
    anyOfPermissions: ["payments.view", "payments.collect"],
    order: 50,
    size: "large",
  },
  {
    id: "today-arrivals",
    title: "Заезды сегодня",
    category: "operations",
    requiredPermissions: ["operations.view", "bookings.view"],
    order: 60,
    size: "medium",
  },
  {
    id: "today-departures",
    title: "Выезды сегодня",
    category: "operations",
    requiredPermissions: ["operations.view", "bookings.view"],
    order: 70,
    size: "medium",
  },
  {
    id: "pending-confirmations",
    title: "Ожидают подтверждения",
    category: "bookings",
    requiredPermissions: ["bookings.confirm"],
    order: 75,
    size: "medium",
  },
  {
    id: "urgent-tasks",
    title: "Срочные задачи",
    category: "tasks",
    requiredPermissions: ["tasks.view"],
    order: 80,
    size: "medium",
  },
];

function hasAllPermissions(permissions: Permission[], requiredPermissions: Permission[]): boolean {
  return requiredPermissions.every((permission) => permissions.includes(permission));
}

function hasAnyPermission(permissions: Permission[], anyOfPermissions: Permission[] | undefined): boolean {
  if (!anyOfPermissions || anyOfPermissions.length === 0) {
    return true;
  }

  return anyOfPermissions.some((permission) => permissions.includes(permission));
}

export function getVisibleDashboardWidgets(permissions: Permission[]): DashboardWidgetDefinition[] {
  return DASHBOARD_WIDGETS
    .filter((widget) => hasAllPermissions(permissions, widget.requiredPermissions))
    .filter((widget) => hasAnyPermission(permissions, widget.anyOfPermissions))
    .sort((a, b) => a.order - b.order);
}

export const DASHBOARD_WIDGET_COMPONENTS: Record<DashboardWidgetId, ComponentType> = {
  properties: PropertiesWidget,
  bookings: BookingsWidget,
  revenue: RevenueWidget,
  occupancy: OccupancyWidget,
  "checkout-payments": CheckoutPaymentsWidget,
  "today-arrivals": TodayArrivalsWidget,
  "today-departures": TodayDeparturesWidget,
  "pending-confirmations": PendingConfirmationsWidget,
  "urgent-tasks": UrgentTasksWidget,
};

export { DASHBOARD_WIDGETS };
