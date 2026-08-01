"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { LayersControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Icon, type LatLngExpression, type LatLngTuple, type Marker as LeafletMarker } from "leaflet";
import type { Apartment } from "@/types/apartment";
import { formatApartmentPrice, getApartmentCoordinates, getApartmentPublicLocation } from "@/lib/apartments/public-catalog";

const markerIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type ApartmentMapItem = {
  apartment: Apartment;
  latitude: number;
  longitude: number;
};

function getCoordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
}

function FitAllMarkers({ points }: { points: LatLngTuple[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
      return;
    }

    map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);

  return null;
}

function FocusMarkerById({
  focusedApartmentId,
  items,
  markerRefs,
}: {
  focusedApartmentId: string | null;
  items: ApartmentMapItem[];
  markerRefs: MutableRefObject<Map<string, LeafletMarker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!focusedApartmentId) {
      return;
    }

    const target = items.find((item) => item.apartment.id === focusedApartmentId);
    if (!target) {
      return;
    }

    map.setView([target.latitude, target.longitude], 15, { animate: true });
    const marker = markerRefs.current.get(target.apartment.id);
    if (marker) {
      marker.openPopup();
    }
  }, [focusedApartmentId, items, map, markerRefs]);

  return null;
}

function InvalidateMapSize({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();

  useEffect(() => {
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen, map]);

  return null;
}

export default function PublicCatalogMap({
  apartments,
  focusedApartmentId,
  checkIn,
  checkOut,
  guests,
  onHide,
}: {
  apartments: Apartment[];
  focusedApartmentId: string | null;
  checkIn: string;
  checkOut: string;
  guests: string;
  onHide?: () => void;
}) {
  const items = useMemo<ApartmentMapItem[]>(() => {
    const coordinateGroups = new Map<string, number>();

    return apartments
      .map((apartment) => {
        const coordinates = getApartmentCoordinates(apartment);
        if (!coordinates) {
          return null;
        }

        const coordinateKey = getCoordinateKey(coordinates.latitude, coordinates.longitude);
        const duplicateIndex = coordinateGroups.get(coordinateKey) ?? 0;
        coordinateGroups.set(coordinateKey, duplicateIndex + 1);
        const duplicateCount = apartments.filter((item) => {
          const itemCoordinates = getApartmentCoordinates(item);
          return itemCoordinates ? getCoordinateKey(itemCoordinates.latitude, itemCoordinates.longitude) === coordinateKey : false;
        }).length;

        if (duplicateCount > 1) {
          const angle = (duplicateIndex / duplicateCount) * Math.PI * 2 - Math.PI / 2;
          const offset = 0.00035;
          coordinates.latitude += Math.cos(angle) * offset;
          coordinates.longitude += Math.sin(angle) * offset;
        }

        return {
          apartment,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        };
      })
      .filter((value): value is ApartmentMapItem => value !== null);
  }, [apartments]);

  const markerRefs = useRef(new Map<string, LeafletMarker>());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const points = useMemo<LatLngTuple[]>(() => items.map((item) => [item.latitude, item.longitude]), [items]);
  const defaultCenter: LatLngExpression = points.length > 0 ? points[0] : [39, 35];

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === mapContainerRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement === mapContainerRef.current) {
      await document.exitFullscreen();
      return;
    }

    if (mapContainerRef.current?.requestFullscreen) {
      await mapContainerRef.current.requestFullscreen();
    }
  }

  return (
    <div ref={mapContainerRef} className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 ${isFullscreen ? "h-screen rounded-none" : ""}`}>
      <div className="absolute right-3 top-3 z-[1000] flex gap-2">
        {onHide ? (
          <button type="button" onClick={onHide} className="rounded-lg border border-white/20 bg-slate-950/85 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-slate-900">
            Скрыть карту
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-white/20 bg-slate-950/85 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-slate-900"
          aria-label={isFullscreen ? "Свернуть карту" : "Открыть карту на весь экран"}
        >
          {isFullscreen ? "Свернуть" : "На весь экран"}
        </button>
      </div>
      <MapContainer center={defaultCenter} zoom={6} maxZoom={19} className={`w-full ${isFullscreen ? "h-screen" : "h-[360px] sm:h-[420px] lg:h-[480px]"}`}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Спутник">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Карта">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <FitAllMarkers points={points} />
        <FocusMarkerById focusedApartmentId={focusedApartmentId} items={items} markerRefs={markerRefs} />
        <InvalidateMapSize isFullscreen={isFullscreen} />

        {items.map((item) => {
          const price = formatApartmentPrice(item.apartment);

          return (
            <Marker
              key={item.apartment.id}
              icon={markerIcon}
              position={[item.latitude, item.longitude]}
              ref={(marker) => {
                if (!marker) {
                  markerRefs.current.delete(item.apartment.id);
                } else {
                  markerRefs.current.set(item.apartment.id, marker);
                }
              }}
            >
              <Popup>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">{item.apartment.title}</p>
                  <p>{getApartmentPublicLocation(item.apartment)}</p>
                  <p>{price}</p>
                  <div className="flex gap-2">
                    <Link href={`/properties/${item.apartment.id}`} className="underline">Подробнее</Link>
                    <Link href={`/properties/${item.apartment.id}?openBooking=1${checkIn ? `&checkIn=${encodeURIComponent(checkIn)}` : ""}${checkOut ? `&checkOut=${encodeURIComponent(checkOut)}` : ""}${guests ? `&guests=${encodeURIComponent(guests)}` : ""}`} className="underline">
                      Забронировать
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
