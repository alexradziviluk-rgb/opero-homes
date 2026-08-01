"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import { hasEffectivePermission } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Booking } from "@/types/booking";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
import { deleteRemoteBooking, persistBookingStatus } from "@/lib/bookings/remote-bookings";
import { createRemoteBookingTasks } from "@/lib/bookings/remote-booking-tasks";
import { fetchStaffBookings, type StaffBooking } from "@/lib/bookings/staff-bookings";

export default function BookingsPage() {
  const { currentUser } = useCurrentUser();
  const [bookings, setBookings] = useState<StaffBooking[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("status"),
  );
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);
  const [isSingleConfirmingId, setIsSingleConfirmingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const pendingOnly = statusFilter === "pending";

  const canConfirmBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.confirm") : false;

  async function reloadBookings() {
    setLoading(true);
    try {
      setBookings(await fetchStaffBookings());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    function handleUpdate() {
      void reloadBookings();
      const params = new URLSearchParams(window.location.search);
      setStatusFilter(params.get("status"));
    }

    void fetchStaffBookings().then((items) => {
      if (!cancelled) {
        setBookings(items);
        setLoading(false);
      }
    });

    window.addEventListener("storage", handleUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  async function handleDelete(booking: Booking) {
    if (!confirm("Удалить бронирование?")) return;
    try {
      await deleteRemoteBooking(booking.id);
      await emitBookingNotificationEvent("booking_cancelled", booking, {
        idempotencySeed: `deleted:${new Date().toISOString()}`,
        actionUrl: "/bookings",
      });
      reloadBookings();
    } catch {
      setActionError("Не удалось удалить бронирование");
    }
  }

  async function handleConfirmOne(booking: Booking) {
    if (!currentUser || !canConfirmBookings) {
      setActionError("Недостаточно прав для подтверждения бронирования.");
      return;
    }

    setActionError("");
    setActionMessage("");
    setIsSingleConfirmingId(booking.id);

    try {
      await persistBookingStatus(booking, "confirmed");
      const confirmedBooking: Booking = { ...booking, status: "confirmed", confirmedByUserId: currentUser.id };
      const taskWarning = await createRemoteBookingTasks(confirmedBooking);
      await emitBookingNotificationEvent("booking_confirmed", confirmedBooking, {
        actionUrl: `/bookings/${booking.id}`,
      });
      const warning = taskWarning ? ` (${taskWarning})` : "";
      setActionMessage(`Бронирование подтверждено${warning}`);
      reloadBookings();
    } catch {
      setActionError("Не удалось подтвердить бронирование");
    } finally {
      setIsSingleConfirmingId(null);
    }
  }

  async function handleRejectOne(booking: Booking) {
    if (!currentUser || !canConfirmBookings) {
      setActionError("Недостаточно прав для отклонения запроса.");
      return;
    }

    try {
      await persistBookingStatus(booking, "rejected");
      setActionMessage("Запрос отклонён. Даты остались доступными.");
      await reloadBookings();
    } catch {
      setActionError("Не удалось отклонить запрос");
    }
  }

  async function handleChangeAmount(booking: Booking) {
    if (!currentUser || !canConfirmBookings || booking.status !== "pending") return;
    const nextAmount = window.prompt("Согласованная стоимость", String(booking.totalAmount));
    if (nextAmount === null) return;
    const totalAmount = Number(nextAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      setActionError("Укажите корректную стоимость.");
      return;
    }

    const response = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalAmount }),
    });
    if (!response.ok) {
      setActionError("Не удалось изменить согласованную стоимость.");
      return;
    }

    setActionMessage("Согласованная стоимость изменена.");
    await reloadBookings();
  }

  async function handleBulkConfirm() {
    if (!currentUser || !canConfirmBookings) {
      setActionError("Недостаточно прав для подтверждения бронирований.");
      return;
    }

    const targets = bookings.filter(
      (booking) => selectedBookingIds.includes(booking.id) && booking.status === "pending",
    );

    if (targets.length === 0) {
      return;
    }

    setActionError("");
    setActionMessage("");
    setIsBulkConfirming(true);

    let confirmedCount = 0;
    let failedCount = 0;

    for (const booking of targets) {
      try {
        await persistBookingStatus(booking, "confirmed");
        const confirmedBooking: Booking = { ...booking, status: "confirmed", confirmedByUserId: currentUser.id };
        await createRemoteBookingTasks(confirmedBooking);
        await emitBookingNotificationEvent("booking_confirmed", confirmedBooking, {
          actionUrl: `/bookings/${booking.id}`,
        });
        confirmedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setIsBulkConfirming(false);
    setSelectedBookingIds([]);
    setActionMessage(`Подтверждено: ${confirmedCount}. Ошибок: ${failedCount}.`);
    reloadBookings();
  }

  const visibleBookings = useMemo(() => {
    if (!pendingOnly) {
      return bookings;
    }
    return bookings.filter((booking) => booking.status === "pending");
  }, [bookings, pendingOnly]);

  const selectedPendingCount = useMemo(
    () => bookings.filter((booking) => selectedBookingIds.includes(booking.id) && booking.status === "pending").length,
    [bookings, selectedBookingIds],
  );

  function toggleSelected(bookingId: string, checked: boolean) {
    if (checked) {
      setSelectedBookingIds((prev) => [...prev, bookingId]);
      return;
    }

    setSelectedBookingIds((prev) => prev.filter((id) => id !== bookingId));
  }

  function toggleAllPending(checked: boolean) {
    if (!checked) {
      setSelectedBookingIds([]);
      return;
    }

    const ids = visibleBookings.filter((booking) => booking.status === "pending").map((booking) => booking.id);
    setSelectedBookingIds(ids);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Бронирования</h1>
              <div className="flex items-center gap-2">
                <Link
                  href={pendingOnly ? "/bookings" : "/bookings?status=pending"}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                >
                  {pendingOnly ? "Показать все" : "Ожидают подтверждения"}
                </Link>
                <Link href="/bookings/new" className="rounded-2xl border border-white/10 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">Новое бронирование</Link>
              </div>
            </div>

            {actionError ? <p className="mb-3 text-sm text-rose-400">{actionError}</p> : null}
            {actionMessage ? <p className="mb-3 text-sm text-emerald-300">{actionMessage}</p> : null}

            {canConfirmBookings && selectedPendingCount > 0 ? (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 p-3">
                <p className="text-sm text-slate-200">Выбрано: {selectedPendingCount}</p>
                <button
                  type="button"
                  onClick={() => void handleBulkConfirm()}
                  disabled={isBulkConfirming}
                  className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBulkConfirming ? "Подтверждаем..." : "Подтвердить выбранные"}
                </button>
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center text-slate-300">Загрузка бронирований...</div>
            ) : visibleBookings.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center">
                <p className="text-slate-400">Пока нет бронирований.</p>
                <Link href="/bookings/new" className="mt-4 inline-block rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">Создать первое бронирование</Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      {canConfirmBookings ? <th className="px-3 py-2"><input type="checkbox" onChange={(event) => toggleAllPending(event.target.checked)} /></th> : null}
                      <th className="px-3 py-2">Гость</th>
                      <th className="px-3 py-2">Объект</th>
                      <th className="px-3 py-2">Заезд</th>
                      <th className="px-3 py-2">Выезд</th>
                      <th className="px-3 py-2">Гостей</th>
                      <th className="px-3 py-2">Сумма</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Оплата</th>
                      <th className="px-3 py-2">Источник</th>
                      <th className="px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBookings.map((b) => {
                      const statusPresentation = getBookingStatusPresentation(b.status);
                      const canConfirmThisBooking = canConfirmBookings && b.status === "pending";
                      const isChecked = selectedBookingIds.includes(b.id);

                      return (
                      <tr key={b.id} className="border-t border-white/5">
                        {canConfirmBookings ? (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={b.status !== "pending"}
                              onChange={(event) => toggleSelected(b.id, event.target.checked)}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2">{b.guestName}</td>
                        <td className="px-3 py-2">{b.apartmentTitle}</td>
                        <td className="px-3 py-2">{new Date(b.checkIn).toLocaleDateString()}</td>
                        <td className="px-3 py-2">{new Date(b.checkOut).toLocaleDateString()}</td>
                        <td className="px-3 py-2">{b.guests}</td>
                        <td className="px-3 py-2">{b.totalAmount} €</td>
                        <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-1 text-xs ${statusPresentation.badgeClassName}`}>{statusPresentation.label}</span></td>
                        <td className="px-3 py-2">{b.paymentStatus}</td>
                        <td className="px-3 py-2">{b.source}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {canConfirmThisBooking ? (
                              <button
                                type="button"
                                onClick={() => void handleConfirmOne(b)}
                                disabled={isSingleConfirmingId === b.id}
                                className="rounded px-2 py-1 bg-emerald-500/10 text-xs text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSingleConfirmingId === b.id ? "Подтверждаем..." : "Подтвердить"}
                              </button>
                            ) : null}
                            {canConfirmThisBooking ? (
                              <>
                                <button type="button" onClick={() => void handleChangeAmount(b)} className="rounded px-2 py-1 bg-amber-500/10 text-xs text-amber-200">Изменить сумму</button>
                                <button type="button" onClick={() => void handleRejectOne(b)} className="rounded px-2 py-1 bg-rose-500/10 text-xs text-rose-200">Отклонить</button>
                              </>
                            ) : null}
                            <Link href={`/bookings/${b.id}`} className="rounded px-2 py-1 bg-white/5 text-xs">Открыть</Link>
                            <Link href={`/bookings/${b.id}/edit`} className="rounded px-2 py-1 bg-white/5 text-xs">Редактировать</Link>
                            <button type="button" onClick={() => void handleDelete(b)} className="rounded px-2 py-1 bg-rose-600/10 text-xs">Удалить</button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
