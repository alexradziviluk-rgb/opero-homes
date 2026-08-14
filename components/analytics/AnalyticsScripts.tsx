"use client";

import Script from "next/script";
import { useEffect } from "react";
import { captureUtmAttribution, hasAdvertisingConsent, hasAnalyticsConsent } from "@/lib/analytics/client";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const validMeasurementId = measurementId && /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : null;
const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const validAdsId = adsId && /^AW-\d+$/i.test(adsId) ? adsId : null;
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const validMetaPixelId = metaPixelId && /^\d{5,20}$/.test(metaPixelId) ? metaPixelId : null;
const analyticsConsentRequired = process.env.NEXT_PUBLIC_ANALYTICS_CONSENT_REQUIRED === "true";

export default function AnalyticsScripts() {
  useEffect(() => {
    captureUtmAttribution();
  }, []);

  const canLoadAdvertising = hasAdvertisingConsent();
  const canLoadAnalytics = !analyticsConsentRequired || hasAnalyticsConsent();
  if (!(canLoadAnalytics && validMeasurementId) && !(canLoadAdvertising && (validAdsId || validMetaPixelId))) return null;

  const serializedMeasurementId = JSON.stringify(validMeasurementId);
  const serializedAdsId = JSON.stringify(validAdsId);
  const serializedMetaPixelId = JSON.stringify(validMetaPixelId);

  return (
    <>
      {(canLoadAnalytics && (validMeasurementId || (canLoadAdvertising && validAdsId))) ? <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validMeasurementId || validAdsId || "")}`} strategy="afterInteractive" />
        <Script id="opero-analytics" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());${canLoadAnalytics && validMeasurementId ? `gtag('config',${serializedMeasurementId},{anonymize_ip:true});` : ""}${canLoadAdvertising && validAdsId ? `gtag('config',${serializedAdsId});` : ""}`}
        </Script>
      </> : null}
      {canLoadAdvertising && validMetaPixelId ? <Script id="opero-meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${serializedMetaPixelId});fbq('consent','grant');`}
      </Script> : null}
    </>
  );
}