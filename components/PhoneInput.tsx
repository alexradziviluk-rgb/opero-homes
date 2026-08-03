"use client";

import { useState } from "react";

const countryCodes = [
  { code: "+357", label: "Кипр (+357)" },
  { code: "+90", label: "Турция (+90)" },
  { code: "+30", label: "Греция (+30)" },
  { code: "+44", label: "Великобритания (+44)" },
  { code: "+49", label: "Германия (+49)" },
  { code: "+7", label: "Россия (+7)" },
  { code: "+380", label: "Украина (+380)" },
  { code: "+1", label: "США/Канада (+1)" },
];

function getPhoneParts(value: string): { countryCode: string; localNumber: string } {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  const countryCode = countryCodes.find((item) => normalized.startsWith(item.code));
  if (countryCode) {
    return { countryCode: countryCode.code, localNumber: normalized.slice(countryCode.code.length).replace(/\D/g, "") };
  }

  return { countryCode: "+357", localNumber: normalized.replace(/\D/g, "") };
}

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
};

export default function PhoneInput({ value, onChange, className = "", placeholder = "Номер телефона", required }: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState(() => getPhoneParts(value).countryCode);
  const parsed = getPhoneParts(value);
  const selectedCode = countryCodes.some((item) => item.code === countryCode) ? countryCode : parsed.countryCode;

  function updateCountryCode(nextCountryCode: string) {
    setCountryCode(nextCountryCode);
    onChange(`${nextCountryCode} ${parsed.localNumber}`.trim());
  }

  function updateLocalNumber(nextLocalNumber: string) {
    const pastedValue = nextLocalNumber.trim().replace(/[\s()-]/g, "");
    const pastedCountryCode = countryCodes.find((item) => pastedValue.startsWith(item.code));
    if (pastedCountryCode) {
      const localNumber = nextLocalNumber.slice(nextLocalNumber.indexOf(pastedCountryCode.code) + pastedCountryCode.code.length).trim();
      setCountryCode(pastedCountryCode.code);
      onChange(`${pastedCountryCode.code} ${localNumber}`.trim());
      return;
    }

    const localNumber = nextLocalNumber.replace(/\D/g, "");
    onChange(`${selectedCode} ${localNumber}`.trim());
  }

  return (
    <div className={`mt-1 flex gap-2 ${className}`}>
      <select
        aria-label="Код страны"
        value={selectedCode}
        onChange={(event) => updateCountryCode(event.target.value)}
        className="w-40 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      >
        {countryCodes.map((item) => <option key={item.code} value={item.code} className="bg-slate-900">{item.label}</option>)}
      </select>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-local"
        aria-label="Телефон"
        value={parsed.localNumber}
        onChange={(event) => updateLocalNumber(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      />
    </div>
  );
}