"use client";

import { useEffect, useState } from "react";

export type Language = "ru" | "en" | "tr";

export function useLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>("ru");

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("opero-language");
    if (storedLanguage !== "ru" && storedLanguage !== "en" && storedLanguage !== "tr") return;
    const frame = window.requestAnimationFrame(() => setLanguage(storedLanguage));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    window.localStorage.setItem("opero-language", nextLanguage);
    document.documentElement.lang = nextLanguage;
  }

  return [language, changeLanguage];
}

export default function LanguageSwitcher({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1" aria-label="Language">
      {(["ru", "en", "tr"] as const).map((option) => (
        <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={language === option} className={`rounded-lg px-2 py-1 text-xs font-semibold ${language === option ? "bg-cyan-500/25 text-cyan-200" : "text-slate-400 hover:text-white"}`}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}