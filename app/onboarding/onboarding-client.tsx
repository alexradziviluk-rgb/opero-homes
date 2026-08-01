"use client";

import Link from "next/link";
import { useState } from "react";
import { countries, countryCurrency, currencies, timezones } from "@/lib/subscriptions/onboarding-options";
import { plans, type PlanCode } from "@/lib/subscriptions/plans";

const steps = ["Компания и регион", "Первый объект", "Команда"];

type OnboardingClientProps = {
  initialData: {
    country: string;
    currency: string;
    timezone: string;
    planCode: PlanCode;
  };
};

export default function OnboardingClient({ initialData }: OnboardingClientProps) {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(initialData.country);
  const [currency, setCurrency] = useState(initialData.currency);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [planCode, setPlanCode] = useState<PlanCode>(initialData.planCode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRegion() {
    setError(null);
    if (!country || !currency || !timezone) {
      setError("Выберите страну, валюту и часовой пояс.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, currency, timezone, planCode }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Не удалось сохранить настройки.");
        return;
      }

      setStep((value) => Math.min(value + 1, steps.length - 1));
    } catch {
      setError("Не удалось сохранить настройки. Проверьте соединение и повторите.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#17251f]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-bold">
          opero<span className="text-[#b27827]">.</span>
        </Link>

        <div className="mt-20">
          <p className="text-sm font-semibold text-[#b27827]">
            ONBOARDING · {step + 1} / {steps.length}
          </p>
          <h1 className="mt-4 text-4xl font-semibold">Настройте рабочее пространство</h1>

          <div className="mt-8 grid grid-cols-3 gap-2">
            {steps.map((label, index) => (
              <div
                key={label}
                className={`border-t-2 pt-3 text-sm ${index <= step ? "border-[#286044] text-[#286044]" : "border-[#d9ded6] text-[#68766d]"}`}
              >
                {label}
              </div>
            ))}
          </div>

          <section className="mt-12 rounded-2xl border border-[#d9ded6] bg-white p-7">
            <h2 className="text-2xl font-semibold">{steps[step]}</h2>

            {step === 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Страна
                  <select
                    value={country}
                    onChange={(event) => {
                      const nextCountry = event.target.value;
                      setCountry(nextCountry);
                      setCurrency(countryCurrency[nextCountry] ?? currency);
                    }}
                    className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3"
                  >
                    <option value="">Выберите страну</option>
                    {countries.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium">
                  Валюта
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3"
                  >
                    {currencies.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium sm:col-span-2">
                  Часовой пояс
                  <select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3"
                  >
                    <option value="">Выберите часовой пояс</option>
                    {timezones.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium sm:col-span-2">
                  Тариф
                  <select
                    value={planCode}
                    onChange={(event) => setPlanCode(event.target.value as PlanCode)}
                    className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3"
                  >
                    {plans.map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.name} · €{plan.monthlyPrice}
                      </option>
                    ))}
                  </select>
                </label>

                {error ? (
                  <p className="sm:col-span-2 rounded-xl border border-[#d4b0a5] bg-[#fff1ed] px-4 py-3 text-sm text-[#8d3d2d]">
                    {error}
                  </p>
                ) : null}

                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveRegion()}
                    disabled={isSaving}
                    className="rounded-full bg-[#286044] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isSaving ? "Сохраняем..." : "Сохранить и продолжить"}
                  </button>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="mt-6 space-y-3 text-[#68766d]">
                <p className="leading-7">Добавьте первый объект, чтобы увидеть рабочий цикл в Dashboard.</p>
                <div className="rounded-2xl border border-dashed border-[#d9ded6] bg-[#f9f7f2] p-6">
                  <h3 className="text-xl font-semibold text-[#17251f]">Первый объект</h3>
                  <p className="mt-3 leading-7">После сохранения региона настройки останутся доступными при повторной загрузке и следующем редактировании.</p>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="mt-6 space-y-3 text-[#68766d]">
                <p className="leading-7">Пригласите команду после завершения первичной настройки.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}