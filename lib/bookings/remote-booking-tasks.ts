import type { Booking } from "@/types/booking";

type Assignee = {
  userId: string;
  roleCode: string;
};

type ExistingTask = {
  id: string;
  booking_id: string | null;
  title: string;
  due_at: string;
};

type TaskDefinition = {
  title: string;
  description: string;
  taskType: "inspection" | "cleaning" | "keys" | "payment" | "instructions";
  dueAt: string;
  assignedUserId: string;
};

function atTime(date: string, hours: number): string {
  return new Date(`${date}T${String(hours).padStart(2, "0")}:00:00`).toISOString();
}

export async function createRemoteBookingTasks(booking: Booking): Promise<string | null> {
  try {
    const [assigneesResponse, tasksResponse] = await Promise.all([
      fetch("/api/notifications/assignees", { cache: "no-store" }),
      fetch("/api/operations/tasks", { cache: "no-store" }),
    ]);
    const assigneesPayload = (await assigneesResponse.json()) as {
      ok: boolean;
      data?: { responsible?: Assignee[]; backupManagers?: Assignee[] };
    };
    const tasksPayload = (await tasksResponse.json()) as { ok: boolean; data?: ExistingTask[] };
    if (!assigneesResponse.ok || !assigneesPayload.ok || !tasksResponse.ok || !tasksPayload.ok) {
      return "Операционные задачи не созданы";
    }

    const responsible = assigneesPayload.data?.responsible ?? [];
    const backupManagers = assigneesPayload.data?.backupManagers ?? [];
    const manager = backupManagers.find((item) => item.roleCode.trim().toLowerCase() === "manager") ?? backupManagers[0] ?? responsible[0];
    const cleaner = responsible.find((item) => item.roleCode.trim().toLowerCase() === "cleaner") ?? manager;
    if (!manager || !cleaner) return "Нет активного сотрудника для назначения задач";

    const definitions: TaskDefinition[] = [
      {
        title: "Проверить готовность объекта к заезду",
        description: `Проверить готовность объекта и отметить возможность заселения для ${booking.guestName}.`,
        taskType: "inspection",
        dueAt: atTime(booking.checkIn, 10),
        assignedUserId: manager.userId,
      },
      {
        title: "Передать ключи гостю",
        description: `Организовать передачу ключей для ${booking.guestName}.`,
        taskType: "keys",
        dueAt: atTime(booking.checkIn, 14),
        assignedUserId: manager.userId,
      },
      {
        title: "Получить остаток оплаты при выезде",
        description: `Проверить и получить остаток оплаты по бронированию ${booking.id}.`,
        taskType: "payment",
        dueAt: atTime(booking.checkOut, 10),
        assignedUserId: manager.userId,
      },
      {
        title: "Отправить инструкции по заселению",
        description: `Отправить инструкции гостю ${booking.guestName}.`,
        taskType: "instructions",
        dueAt: atTime(booking.checkIn, 12),
        assignedUserId: manager.userId,
      },
      {
        title: "Уборка после выезда",
        description: `Принять объект и выполнить уборку после выезда ${booking.guestName}.`,
        taskType: "cleaning",
        dueAt: atTime(booking.checkOut, 11),
        assignedUserId: cleaner.userId,
      },
      {
        title: "Рассчитать и вернуть депозит",
        description: `Проверить объект и оформить возврат депозита ${booking.deposit} EUR.`,
        taskType: "payment",
        dueAt: atTime(booking.checkOut, 13),
        assignedUserId: manager.userId,
      },
    ];

    const existingTitles = new Set(
      (tasksPayload.data ?? [])
        .filter((task) => task.booking_id === booking.id)
        .map((task) => task.title),
    );

    const obsoleteTasks = (tasksPayload.data ?? []).filter(
      (task) => task.booking_id === booking.id && ["Подготовить объект к заезду", "Проверить оплату по бронированию"].includes(task.title),
    );
    for (const task of obsoleteTasks) {
      await fetch("/api/operations/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: "cancelled" }),
      });
    }

    for (const task of definitions.filter((item) => !existingTitles.has(item.title))) {
      const response = await fetch("/api/operations/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...task,
          apartmentId: booking.apartmentId,
          bookingId: booking.id,
          priority: "normal",
        }),
      });
      if (!response.ok) return "Часть операционных задач не создана";
    }

    return cleaner.roleCode.trim().toLowerCase() === "cleaner"
      ? null
      : "Уборщик не добавлен; задачи уборки назначены менеджеру";
  } catch {
    return "Операционные задачи не созданы";
  }
}