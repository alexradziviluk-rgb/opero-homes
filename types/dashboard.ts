export type DashboardArrivalDepartureItem = {
  bookingId: string;
  guestName: string;
  apartmentTitle: string;
  dateLabel: string;
};

export type DashboardTaskItem = {
  taskId: string;
  title: string;
  taskType: string;
  status: string;
};

export type DashboardRevenueByCurrency = {
  currency: string;
  amount: number;
};

export type DashboardMetrics = {
  propertiesTotal: number;
  propertiesActive: number | null;
  propertiesOccupied: number;
  propertiesAvailable: number;
  overdueCleaningCount: number;
  overdueMaintenanceCount: number;
  tasksDueTodayCount: number;
  slaWarningsCount: number;
  overdueOperationalTasksCount: number;
  unreadNotificationsCount: number;
  bookingsTotal: number;
  bookingsActiveFuture: number;
  occupancyPercent: number | null;
  revenueByCurrency: DashboardRevenueByCurrency[];
  weeklyRevenueByCurrency: DashboardRevenueByCurrency[];
  revenueDataStatus: "ok" | "no_payments" | "insufficient_schema";
  checkoutPayments: Array<{
    bookingId: string;
    apartmentTitle: string;
    guestName: string;
    checkoutDate: string;
  }>;
  checkoutPaymentsStatus: "ok" | "no_payments" | "insufficient_schema";
  todayArrivals: DashboardArrivalDepartureItem[];
  todayDepartures: DashboardArrivalDepartureItem[];
  pendingConfirmationsCount: number;
  urgentTasks: DashboardTaskItem[];
};

export type DashboardMetricsResponse = {
  ok: boolean;
  data?: DashboardMetrics;
  error?: string;
};
