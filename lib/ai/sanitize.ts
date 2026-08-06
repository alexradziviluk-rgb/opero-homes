import type { AIAssistantRole, AIToolResult } from "./types";

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function errorOnly(value: unknown): RecordValue {
  const record = asRecord(value);
  return typeof record?.error === "string" ? { error: record.error } : {};
}

function publicRoute(id: unknown): string | undefined {
  return typeof id === "string" && id.length > 0 ? `/properties/${encodeURIComponent(id)}` : undefined;
}

function sanitizeProperties(value: unknown): RecordValue {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.properties)) return errorOnly(value);
  return {
    properties: record.properties.map((item) => {
      const property = asRecord(item) ?? {};
      return {
        ...(publicRoute(property.id) ? { publicRoute: publicRoute(property.id) } : {}),
        title: typeof property.title === "string" ? property.title : "Объект",
        city: typeof property.city === "string" ? property.city : "",
        district: typeof property.district === "string" ? property.district : "",
        shortDesc: typeof property.shortDesc === "string" ? property.shortDesc : "",
        maxGuests: typeof property.maxGuests === "number" ? property.maxGuests : 0,
        dailyPrice: typeof property.dailyPrice === "number" ? property.dailyPrice : null,
        currency: typeof property.currency === "string" ? property.currency : "EUR",
        publicationStatus: property.publicationStatus === "published" ? "published" : undefined,
      };
    }),
  };
}

function sanitizeAvailability(value: unknown): RecordValue {
  const record = asRecord(value);
  if (!record) return {};
  if (typeof record.error === "string") return { error: record.error };
  return {
    ...(typeof record.status === "string" ? { status: record.status } : {}),
    ...(typeof record.checkIn === "string" ? { checkIn: record.checkIn } : {}),
    ...(typeof record.checkOut === "string" ? { checkOut: record.checkOut } : {}),
    ...(typeof record.available === "boolean" ? { available: record.available } : {}),
  };
}

function sanitizeQuote(value: unknown): RecordValue {
  const record = asRecord(value);
  if (!record) return {};
  if (typeof record.error === "string") return { error: record.error };
  const allowed = ["apartmentTitle", "checkIn", "checkOut", "nights", "guests", "currency", "pricePeriod", "pricePerPeriod", "rentalType", "accommodationAmount", "cleaningFee", "deposit", "discount", "totalAmount", "maxGuests", "minimumStay"];
  return Object.fromEntries(allowed.filter((key) => key in record).map((key) => [key, record[key]]));
}

function sanitizeBookingList(value: unknown): unknown {
  if (!Array.isArray(value)) return errorOnly(value);
  return value.map((item) => {
    const booking = asRecord(item) ?? {};
    return {
      ...(typeof booking.apartmentTitle === "string" ? { apartmentTitle: booking.apartmentTitle } : {}),
      ...(typeof booking.checkIn === "string" ? { checkIn: booking.checkIn } : {}),
      ...(typeof booking.checkOut === "string" ? { checkOut: booking.checkOut } : {}),
      ...(typeof booking.status === "string" ? { status: booking.status } : {}),
      ...(typeof booking.totalAmount === "number" ? { totalAmount: booking.totalAmount } : {}),
    };
  });
}

function sanitizeTaskList(value: unknown): unknown {
  if (!Array.isArray(value)) return errorOnly(value);
  return value.map((item) => {
    const task = asRecord(item) ?? {};
    return {
      ...(typeof task.title === "string" ? { title: task.title } : {}),
      ...(typeof task.description === "string" ? { description: task.description } : {}),
      ...(typeof task.status === "string" ? { status: task.status } : {}),
      ...(typeof task.taskType === "string" ? { taskType: task.taskType } : {}),
      ...(typeof task.priority === "string" ? { priority: task.priority } : {}),
      ...(typeof task.dueAt === "string" ? { dueAt: task.dueAt } : {}),
    };
  });
}

function sanitizeToolData(role: AIAssistantRole, tool: string, value: unknown): unknown {
  if (tool === "searchPublishedProperties") return sanitizeProperties(value);
  if (tool === "getPublicAvailability") return sanitizeAvailability(value);
  if (tool === "calculatePublicQuote") return sanitizeQuote(value);
  if (tool === "getMyProfile") {
    if (role !== "client") return errorOnly(value);
    const record = asRecord(value);
    return record?.error ? errorOnly(value) : {
      ...(typeof record?.firstName === "string" ? { firstName: record.firstName } : {}),
      ...(typeof record?.lastName === "string" ? { lastName: record.lastName } : {}),
      ...(typeof record?.email === "string" ? { email: record.email } : {}),
      ...(typeof record?.phone === "string" ? { phone: record.phone } : {}),
    };
  }
  if (tool === "getMyBookingRequests") return sanitizeBookingList(value);
  if (tool === "getPendingRequests") return sanitizeBookingList(value);
  if (["getMyTasks", "getOperationalTasks"].includes(tool)) return sanitizeTaskList(value);
  if (["getMyProperties", "getApartments"].includes(tool)) {
    const record = asRecord(value);
    if (!record || !Array.isArray(record.properties)) return errorOnly(value);
    return { properties: record.properties.map((item) => {
      const property = asRecord(item) ?? {};
      return {
        ...(typeof property.title === "string" ? { title: property.title } : {}),
        ...(typeof property.city === "string" ? { city: property.city } : {}),
        ...(typeof property.district === "string" ? { district: property.district } : {}),
        ...(typeof property.publicationStatus === "string" ? { publicationStatus: property.publicationStatus } : {}),
        ...(typeof property.availability === "string" ? { availability: property.availability } : {}),
        ...(typeof property.maxGuests === "number" ? { maxGuests: property.maxGuests } : {}),
      };
    }) };
  }
  if (tool === "getOrganizationSummary") {
    const record = asRecord(value);
    return record?.error ? errorOnly(value) : {
      ...(typeof record?.apartments === "number" ? { apartments: record.apartments } : {}),
      ...(typeof record?.bookings === "number" ? { bookings: record.bookings } : {}),
      ...(typeof record?.pendingBookings === "number" ? { pendingBookings: record.pendingBookings } : {}),
      ...(typeof record?.openTasks === "number" ? { openTasks: record.openTasks } : {}),
    };
  }
  if (tool === "getEmployees") {
    const record = asRecord(value);
    return record?.error ? errorOnly(value) : Array.isArray(value) ? value.map((item) => {
      const employee = asRecord(item) ?? {};
      return {
        ...(typeof employee.role === "string" ? { role: employee.role } : {}),
        ...(typeof employee.status === "string" ? { status: employee.status } : {}),
      };
    }) : [];
  }
  if (tool === "getTaskDetails") {
    const record = asRecord(value);
    if (record?.error) return errorOnly(value);
    const sanitized = sanitizeTaskList([record]);
    return Array.isArray(sanitized) ? sanitized[0] : {};
  }
  if (tool === "getMyPropertyCalendar") {
    const record = asRecord(value);
    return record?.error ? errorOnly(value) : { periods: Array.isArray(record?.periods) ? record.periods.map((period) => {
      const item = asRecord(period) ?? {};
      return { ...(typeof item.startDate === "string" ? { startDate: item.startDate } : {}), ...(typeof item.endDate === "string" ? { endDate: item.endDate } : {}), ...(typeof item.status === "string" ? { status: item.status } : {}) };
    }) : [] };
  }
  return errorOnly(value);
}

export function sanitizeAiToolResultForClient(role: AIAssistantRole, result: AIToolResult): AIToolResult {
  return {
    tool: result.tool,
    ...(typeof result.source === "string" ? { source: result.source } : {}),
    data: sanitizeToolData(role, result.tool, result.data),
  };
}
