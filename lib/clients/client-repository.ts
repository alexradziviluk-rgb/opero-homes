import { CLIENTS_STORAGE_KEY, type Client, type ClientDraft } from "@/types/client";

function safeParse(json: string | null): unknown {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `cl_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeClient(raw: Partial<Client>): Client {
  const now = nowIso();
  return {
    id: raw.id ?? generateId(),
    firstName: raw.firstName ?? "",
    lastName: raw.lastName ?? "",
    phone: raw.phone ?? "",
    email: raw.email ?? "",
    nationality: raw.nationality ?? "",
    documentType: raw.documentType ?? "passport",
    documentNumber: raw.documentNumber ?? "",
    dateOfBirth: raw.dateOfBirth ?? "",
    language: raw.language ?? "ru",
    notes: raw.notes ?? "",
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

function readStorage(): Client[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CLIENTS_STORAGE_KEY);
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeClient(item as Partial<Client>));
}

function writeStorage(clients: Client[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients));
}

export function getClients(): Client[] {
  return readStorage().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function searchClients(query: string): Client[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return getClients();

  return getClients().filter((client) => {
    const fullName = `${client.firstName} ${client.lastName}`.toLowerCase();
    return (
      fullName.includes(normalized) ||
      client.phone.toLowerCase().includes(normalized) ||
      client.email.toLowerCase().includes(normalized)
    );
  });
}

export function getClientById(id: string): Client | null {
  return getClients().find((client) => client.id === id) ?? null;
}

export function createClient(payload: ClientDraft): Client {
  const now = nowIso();
  const client = normalizeClient({
    ...payload,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  });

  const clients = getClients();
  writeStorage([client, ...clients]);
  return client;
}

export function updateClient(client: Client): Client {
  const clients = getClients();
  const next = clients.map((item) =>
    item.id === client.id ? normalizeClient({ ...item, ...client, updatedAt: nowIso() }) : item,
  );
  writeStorage(next);
  return next.find((item) => item.id === client.id) ?? client;
}

export function upsertClient(client: Client): Client {
  const clients = getClients();
  const existing = clients.find((item) => item.id === client.id);
  if (!existing) {
    const created = normalizeClient(client);
    writeStorage([created, ...clients]);
    return created;
  }

  return updateClient({ ...existing, ...client, id: existing.id });
}

export function deleteClient(id: string): void {
  const clients = getClients();
  const next = clients.filter((item) => item.id !== id);
  writeStorage(next);
}
