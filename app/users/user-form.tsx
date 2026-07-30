"use client";

import type { UserCreateInput, UserRole, UserStatus } from "@/types/user";

type UserFormValues = Omit<UserCreateInput, "organizationId">;

type UserFormProps = {
  value: UserFormValues;
  errors: Partial<Record<keyof UserFormValues, string>>;
  onChange: <K extends keyof UserFormValues>(key: K, nextValue: UserFormValues[K]) => void;
};

const roleOptions: UserRole[] = [
  "Владелец",
  "Администратор",
  "Менеджер",
  "Сотрудник",
  "Уборщик",
  "Технический специалист",
  "Гость",
];

const statusOptions: UserStatus[] = [
  "Приглашен",
  "Ожидает подтверждения",
  "Активен",
  "Заблокирован",
  "Приглашение истекло",
];

export default function UserForm({ value, errors, onChange }: UserFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        <div className="text-sm text-slate-300">Имя</div>
        <input value={value.firstName} onChange={(event) => onChange("firstName", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.firstName ? <p className="mt-1 text-sm text-rose-400">{errors.firstName}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Фамилия</div>
        <input value={value.lastName} onChange={(event) => onChange("lastName", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.lastName ? <p className="mt-1 text-sm text-rose-400">{errors.lastName}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Email</div>
        <input type="email" value={value.email} onChange={(event) => onChange("email", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        {errors.email ? <p className="mt-1 text-sm text-rose-400">{errors.email}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Телефон</div>
        <input value={value.phone} onChange={(event) => onChange("phone", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>

      <label>
        <div className="text-sm text-slate-300">Роль</div>
        <select value={value.role} onChange={(event) => onChange("role", event.target.value as UserRole)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
          {roleOptions.map((role) => (
            <option key={role} value={role} className="bg-slate-900">
              {role}
            </option>
          ))}
        </select>
        {errors.role ? <p className="mt-1 text-sm text-rose-400">{errors.role}</p> : null}
      </label>

      <label>
        <div className="text-sm text-slate-300">Статус</div>
        <select value={value.status} onChange={(event) => onChange("status", event.target.value as UserStatus)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
          {statusOptions.map((status) => (
            <option key={status} value={status} className="bg-slate-900">
              {status}
            </option>
          ))}
        </select>
      </label>

      <label>
        <div className="text-sm text-slate-300">Язык</div>
        <input value={value.language} onChange={(event) => onChange("language", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>

      <label>
        <div className="text-sm text-slate-300">Аватар URL</div>
        <input value={value.avatarUrl ?? ""} onChange={(event) => onChange("avatarUrl", event.target.value || null)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>

      <label className="sm:col-span-2">
        <div className="text-sm text-slate-300">Заметки</div>
        <textarea value={value.notes} onChange={(event) => onChange("notes", event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
      </label>
    </div>
  );
}
