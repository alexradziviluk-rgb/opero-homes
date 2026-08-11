"use client";

import type { ClientDraft } from "@/types/client";
import PhoneInput from "@/components/PhoneInput";

type ClientFormProps = {
  value: ClientDraft;
  errors: Partial<Record<keyof ClientDraft, string>>;
  onChange: <K extends keyof ClientDraft>(key: K, nextValue: ClientDraft[K]) => void;
  emailConfirmation?: string;
  emailConfirmationError?: string;
  onEmailConfirmationChange?: (nextValue: string) => void;
};

const documentOptions = [
  { value: "passport", label: "Паспорт" },
  { value: "id_card", label: "ID карта" },
  { value: "residence_permit", label: "ВНЖ" },
  { value: "other", label: "Другой" },
];

const languageOptions = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "tr", label: "Turkce" },
  { value: "de", label: "Deutsch" },
  { value: "other", label: "Другой" },
];

export default function ClientForm({ value, errors, onChange, emailConfirmation, emailConfirmationError, onEmailConfirmationChange }: ClientFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        <div className="text-sm text-slate-300">Имя</div>
        <input required value={value.firstName} onChange={(event) => onChange("firstName", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.firstName ? <p className="mt-1 text-sm text-rose-400">{errors.firstName}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Фамилия</div>
        <input required value={value.lastName} onChange={(event) => onChange("lastName", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.lastName ? <p className="mt-1 text-sm text-rose-400">{errors.lastName}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Телефон</div>
        <PhoneInput required value={value.phone} onChange={(nextValue) => onChange("phone", nextValue)} />
        {errors.phone ? <p className="mt-1 text-sm text-rose-400">{errors.phone}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Email</div>
        <input required type="email" value={value.email} onChange={(event) => onChange("email", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.email ? <p className="mt-1 text-sm text-rose-400">{errors.email}</p> : null}
      </label>

      {onEmailConfirmationChange ? <label>
        <div className="text-sm text-slate-300">Подтверждение email</div>
        <input required type="email" value={emailConfirmation ?? ""} onChange={(event) => onEmailConfirmationChange(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {emailConfirmationError ? <p className="mt-1 text-sm text-rose-400">{emailConfirmationError}</p> : null}
      </label> : null}

      <label>
        <div className="text-sm text-slate-300">Гражданство</div>
        <input value={value.nationality} onChange={(event) => onChange("nationality", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>

      <label>
        <div className="text-sm text-slate-300">Тип документа</div>
        <select value={value.documentType} onChange={(event) => onChange("documentType", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
          {documentOptions.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-900">
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <div className="text-sm text-slate-300">Номер документа</div>
        <input value={value.documentNumber} onChange={(event) => onChange("documentNumber", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>

      <label>
        <div className="text-sm text-slate-300">Дата рождения</div>
        <input required type="date" value={value.dateOfBirth} onChange={(event) => onChange("dateOfBirth", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.dateOfBirth ? <p className="mt-1 text-sm text-rose-400">{errors.dateOfBirth}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Язык</div>
        <select value={value.language} onChange={(event) => onChange("language", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-900">
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="sm:col-span-2">
        <div className="text-sm text-slate-300">Заметки</div>
        <textarea value={value.notes} onChange={(event) => onChange("notes", event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>
    </div>
  );
}
