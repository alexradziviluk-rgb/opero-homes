export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationality: string;
  documentType: string;
  documentNumber: string;
  dateOfBirth: string;
  language: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientDraft = Omit<Client, "id" | "createdAt" | "updatedAt">;

export const CLIENTS_STORAGE_KEY = "opero-homes-clients";

export const initialClientDraft: ClientDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  nationality: "",
  documentType: "passport",
  documentNumber: "",
  dateOfBirth: "",
  language: "ru",
  notes: "",
};
