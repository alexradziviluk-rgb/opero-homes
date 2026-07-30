import type { BookingStatus } from "@/types/booking";

export type BookingStatusPresentation = {
  status: BookingStatus;
  label: string;
  badgeClassName: string;
  dotClassName: string;
};

export function normalizeBookingStatus(status: unknown): BookingStatus {
  const value = String(status ?? "").trim().toLowerCase();

  if (value === "pending" || value === "ожидает подтверждения") return "pending";
  if (value === "confirmed" || value === "подтверждено" || value === "забронирован") return "confirmed";
  if (value === "checked_in" || value === "заезд") return "checked_in";
  if (value === "checked_out" || value === "выезд") return "checked_out";
  if (value === "cancelled" || value === "отменено") return "cancelled";

  return "pending";
}

export function getBookingStatusPresentation(inputStatus: unknown): BookingStatusPresentation {
  const status = normalizeBookingStatus(inputStatus);

  if (status === "pending") {
    return {
      status,
      label: "Ожидает подтверждения",
      badgeClassName: "bg-amber-500/20 text-amber-200 border border-amber-400/30",
      dotClassName: "bg-amber-400 text-slate-900",
    };
  }

  if (status === "confirmed") {
    return {
      status,
      label: "Подтверждено",
      badgeClassName: "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30",
      dotClassName: "bg-emerald-400 text-slate-900",
    };
  }

  if (status === "checked_in") {
    return {
      status,
      label: "Заезд",
      badgeClassName: "bg-sky-500/20 text-sky-200 border border-sky-400/30",
      dotClassName: "bg-sky-400 text-slate-900",
    };
  }

  if (status === "checked_out") {
    return {
      status,
      label: "Выезд",
      badgeClassName: "bg-slate-500/20 text-slate-200 border border-slate-400/30",
      dotClassName: "bg-slate-400 text-slate-900",
    };
  }

  return {
    status,
    label: "Отменено",
    badgeClassName: "bg-rose-500/20 text-rose-200 border border-rose-400/30",
    dotClassName: "bg-rose-400 text-slate-900",
  };
}
