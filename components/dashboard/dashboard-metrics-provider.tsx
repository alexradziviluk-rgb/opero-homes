"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { DashboardMetrics, DashboardMetricsResponse } from "@/types/dashboard";

type DashboardMetricsContextValue = {
  data: DashboardMetrics | null;
  isLoading: boolean;
  error: string | null;
};

const DashboardMetricsContext = createContext<DashboardMetricsContextValue>({
  data: null,
  isLoading: true,
  error: null,
});

export function DashboardMetricsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/dashboard/metrics", {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json()) as DashboardMetricsResponse;

        if (!mounted) {
          return;
        }

        if (!response.ok || !payload.ok || !payload.data) {
          setData(null);
          setError(payload.error ?? "Не удалось загрузить метрики Dashboard.");
          setIsLoading(false);
          return;
        }

        setData(payload.data);
        setIsLoading(false);
      } catch {
        if (!mounted) {
          return;
        }

        setData(null);
        setError("Не удалось загрузить метрики Dashboard.");
        setIsLoading(false);
      }
    }

    void loadMetrics();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({ data, isLoading, error }),
    [data, isLoading, error],
  );

  return <DashboardMetricsContext.Provider value={value}>{children}</DashboardMetricsContext.Provider>;
}

export function useDashboardMetrics() {
  return useContext(DashboardMetricsContext);
}
