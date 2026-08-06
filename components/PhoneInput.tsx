"use client";

import { getCountries, getCountryCallingCode } from "libphonenumber-js";

type CountryOption = {
  code: string;
  label: string;
};

const regionNames = new Intl.DisplayNames(["ru"], { type: "region" });

const countryCodes: CountryOption[] = (() => {
  const labelsByCode = new Map<string, string[]>();

  getCountries().forEach((country) => {
    const code = `+${getCountryCallingCode(country)}`;
    const name = regionNames.of(country) ?? country;
    const names = labelsByCode.get(code) ?? [];
    names.push(name);
    labelsByCode.set(code, names);
  });

  return [...labelsByCode.entries()]
    .map(([code, names]) => ({
      code,
      label: `${names.sort((a, b) => a.localeCompare(b, "ru")).join(" / ")} (${code})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
})();

const countryCodesByLength = [...countryCodes].sort((a, b) => b.code.length - a.code.length);

function getPhoneParts(value: string): { countryCode: string; localNumber: string } {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  const knownCountryCode = countryCodesByLength.find((item) => normalized.startsWith(item.code));
  if (knownCountryCode) {
    return { countryCode: knownCountryCode.code, localNumber: normalized.slice(knownCountryCode.code.length).replace(/\D/g, "") };
  }

  const manualCountryCode = normalized.match(/^\+\d{1,4}/)?.[0];
  if (manualCountryCode) {
    return { countryCode: manualCountryCode, localNumber: normalized.slice(manualCountryCode.length).replace(/\D/g, "") };
  }

  return { countryCode: "+", localNumber: normalized.replace(/\D/g, "") };
}

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
};

export default function PhoneInput({ value, onChange, className = "", placeholder = "Номер телефона", required }: PhoneInputProps) {
  const parsed = getPhoneParts(value);
  const countryCode = parsed.countryCode;
  const selectedCode = countryCodes.some((item) => item.code === countryCode) ? countryCode : "";

  function updateCountryCode(nextCountryCode: string) {
    onChange(`${nextCountryCode} ${parsed.localNumber}`.trim());
  }

  function updateManualCountryCode(nextValue: string) {
    const nextCountryCode = nextValue.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    onChange(`${nextCountryCode} ${parsed.localNumber}`.trim());
  }

  function updateLocalNumber(nextLocalNumber: string) {
    const pastedValue = nextLocalNumber.trim().replace(/[\s()-]/g, "");
    const pastedCountryCode = countryCodesByLength.find((item) => pastedValue.startsWith(item.code));
    if (pastedCountryCode) {
      const localNumber = nextLocalNumber.slice(nextLocalNumber.indexOf(pastedCountryCode.code) + pastedCountryCode.code.length).trim();
      onChange(`${pastedCountryCode.code} ${localNumber}`.trim());
      return;
    }

    const localNumber = nextLocalNumber.replace(/\D/g, "");
    onChange(`${countryCode} ${localNumber}`.trim());
  }

  return (
    <div className={`mt-1 flex flex-wrap gap-2 ${className}`}>
      <select
        aria-label="Код страны"
        value={selectedCode}
        onChange={(event) => updateCountryCode(event.target.value)}
        className="w-40 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      >
        <option value="" className="bg-slate-900">Выберите страну</option>
        {countryCodes.map((item) => <option key={item.code} value={item.code} className="bg-slate-900" suppressHydrationWarning>{item.label}</option>)}
      </select>
      <input
        type="tel"
        inputMode="tel"
        aria-label="Код страны вручную"
        value={countryCode}
        onChange={(event) => updateManualCountryCode(event.target.value)}
        placeholder="+90"
        className="w-20 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      />
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-local"
        aria-label="Телефон"
        value={parsed.localNumber}
        onChange={(event) => updateLocalNumber(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      />
    </div>
  );
}
