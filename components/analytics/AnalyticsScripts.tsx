"use client";

import Script from "next/script";
import { useEffect } from "react";
import { captureUtmAttribution } from "@/lib/analytics/client";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const validMeasurementId = measurementId && /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : null;

export default function AnalyticsScripts() {
  useEffect(() => {
    captureUtmAttribution();
  }, []);

  if (!validMeasurementId) return null;

  const serializedMeasurementId = JSON.stringify(validMeasurementId);

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validMeasurementId)}`} strategy="afterInteractive" />
      <Script id="opero-analytics" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${serializedMeasurementId},{anonymize_ip:true});`}
      </Script>
    </>
  );
}