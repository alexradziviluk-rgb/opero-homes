"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
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

export default function PublicCatalogMap({
  apartments,
  focusedApartmentId,
  checkIn,
  checkOut,
  guests,
}: {
  apartments: Apartment[];
  focusedApartmentId: string | null;
  checkIn: string;
  checkOut: string;
  guests: string;
}) {
  const items = useMemo<ApartmentMapItem[]>(() => {
    return apartments
      .map((apartment) => {
        const coordinates = getApartmentCoordinates(apartment);
        if (!coordinates) {
          return null;
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

  const points = useMemo<LatLngTuple[]>(() => items.map((item) => [item.latitude, item.longitude]), [items]);
  const defaultCenter: LatLngExpression = points.length > 0 ? points[0] : [39, 35];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
      <MapContainer center={defaultCenter} zoom={6} className="h-[540px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitAllMarkers points={points} />
        <FocusMarkerById focusedApartmentId={focusedApartmentId} items={items} markerRefs={markerRefs} />

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
                    <Link href={`/stay/${item.apartment.id}`} className="underline">Подробнее</Link>
                    <Link href={`/stay/${item.apartment.id}?openBooking=1${checkIn ? `&checkIn=${encodeURIComponent(checkIn)}` : ""}${checkOut ? `&checkOut=${encodeURIComponent(checkOut)}` : ""}${guests ? `&guests=${encodeURIComponent(guests)}` : ""}`} className="underline">
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
